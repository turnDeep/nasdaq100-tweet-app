from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from models import User, UserCredential, AuthChallenge
import uuid
import json
import os
import base64
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
    base64url_to_bytes,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    RegistrationCredential,
    AuthenticationCredential,
    AuthenticatorAttachment,
    ResidentKeyRequirement,
)
import logging

logger = logging.getLogger(__name__)

# WebAuthn Settings
RP_ID = "localhost"
RP_NAME = "Nasdaq100 Analysis App"
ORIGIN = "http://localhost:3000"

class AuthService:
    def __init__(self):
        self.gate_password = "7777"

    def verify_gate_password(self, password: str) -> bool:
        return password == self.gate_password

    def get_user(self, db: Session, user_id: str):
        return db.query(User).filter(User.id == user_id).first()

    def get_user_by_username(self, db: Session, username: str):
        return db.query(User).filter(User.username == username).first()

    def generate_registration_options(self, db: Session, username: str, display_name: str = None):
        user = self.get_user_by_username(db, username)

        if not user:
            # New user: Generate a new ID
            user_id = str(uuid.uuid4())
            # Note: We don't save the user yet, we wait for verification
        else:
            user_id = user.id

        # Check existing credentials to exclude
        exclude_credentials = []
        if user:
            for cred in user.credentials:
                exclude_credentials.append({
                    "id": base64url_to_bytes(cred.credential_id),
                    "transports": json.loads(cred.transports) if cred.transports else None,
                    "type": "public-key"
                })

        options = generate_registration_options(
            rp_id=RP_ID,
            rp_name=RP_NAME,
            user_id=base64url_to_bytes(base64.urlsafe_b64encode(user_id.encode()).decode().rstrip('=')), # Needs to be bytes
            user_name=username,
            user_display_name=display_name or username,
            authenticator_selection=AuthenticatorSelectionCriteria(
                user_verification=UserVerificationRequirement.PREFERRED,
                resident_key=ResidentKeyRequirement.PREFERRED,
                authenticator_attachment=AuthenticatorAttachment.PLATFORM
                # Note: For multi-device, we might want CROSS_PLATFORM or leave it None to allow both.
                # 'PLATFORM' usually implies built-in like TouchID/Windows Hello.
                # To support roaming keys (YubiKey) or phone-as-key, remove attachment restriction or use CROSS_PLATFORM.
                # However, the requirement says "Windows Hello, Face ID, Touch ID" which are PLATFORM.
                # But "Google Password Manager" syncs passkeys, which acts like PLATFORM but syncs.
                # Let's leave attachment as None to be most flexible (allowing both platform and cross-platform).
            ),
            exclude_credentials=exclude_credentials,
        )

        # Save challenge
        challenge_id = base64.urlsafe_b64encode(options.challenge).decode().rstrip('=')
        db_challenge = AuthChallenge(
            challenge_id=challenge_id,
            user_id=user_id,
            challenge=challenge_id, # Using the ID as the challenge string representation for simplicity here
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)
        )
        db.add(db_challenge)
        db.commit()

        return options, user_id

    def verify_registration(self, db: Session, response_data: dict, user_id: str, username: str, image_data: str = None):
        # Retrieve challenge
        # In a real app, response_data should contain the challenge ID to look up,
        # but WebAuthn response structure is complex.
        # Usually we rely on session or a passed ID.
        # Here we assume the client passes back the challenge ID somehow or we query the latest for user?
        # A robust way is to store challenge in a http-only cookie or session.
        # For this PoC, we might need to find the challenge.

        # Let's try to find a valid challenge for this user_id
        challenge_record = db.query(AuthChallenge).filter(
            AuthChallenge.user_id == user_id,
            AuthChallenge.expires_at > datetime.now(timezone.utc)
        ).order_by(AuthChallenge.created_at.desc()).first()

        if not challenge_record:
            raise Exception("Challenge not found or expired")

        try:
            verification = verify_registration_response(
                credential=RegistrationCredential.parse_obj(response_data),
                expected_challenge=base64url_to_bytes(challenge_record.challenge),
                expected_origin=ORIGIN,
                expected_rp_id=RP_ID,
            )
        except Exception as e:
            logger.error(f"Verification failed: {e}")
            raise e

        # Create or Update User
        user = self.get_user(db, user_id)
        if not user:
            user = User(
                id=user_id,
                username=username,
                display_name=username,
                profile_image=image_data
            )
            db.add(user)
        elif image_data:
             # Update image if provided
             user.profile_image = image_data

        # Create Credential
        credential_id = base64.urlsafe_b64encode(verification.credential_id).decode().rstrip('=')
        public_key = base64.urlsafe_b64encode(verification.credential_public_key).decode().rstrip('=')

        cred = UserCredential(
            user_id=user.id,
            credential_id=credential_id,
            public_key=public_key,
            sign_count=verification.sign_count,
            transports=json.dumps(response_data.get("response", {}).get("transports", []))
        )
        db.add(cred)

        # Cleanup challenge
        db.delete(challenge_record)
        db.commit()

        return user

    def generate_login_options(self, db: Session, username: str = None):
        user = None
        allow_credentials = []

        if username:
            user = self.get_user_by_username(db, username)
            if user:
                for cred in user.credentials:
                    allow_credentials.append({
                        "id": base64url_to_bytes(cred.credential_id),
                        "type": "public-key",
                        "transports": json.loads(cred.transports) if cred.transports else None
                    })

        # If no username, we do conditional UI (resident key) flow if supported,
        # or require username. For this app, let's support username-less if resident keys are used,
        # but the prompt implies entering username first. Let's stick to username-based for simplicity first.

        options = generate_authentication_options(
            rp_id=RP_ID,
            allow_credentials=allow_credentials if allow_credentials else None,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        # Save challenge (Associate with user if known, else anonymous challenge)
        challenge_id = base64.urlsafe_b64encode(options.challenge).decode().rstrip('=')
        db_challenge = AuthChallenge(
            challenge_id=challenge_id,
            user_id=user.id if user else None,
            challenge=challenge_id,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)
        )
        db.add(db_challenge)
        db.commit()

        return options

    def verify_login(self, db: Session, response_data: dict, username: str):
        # Find user
        user = self.get_user_by_username(db, username)
        if not user:
            raise Exception("User not found")

        # Find challenge
        challenge_record = db.query(AuthChallenge).filter(
            AuthChallenge.user_id == user.id,
            AuthChallenge.expires_at > datetime.now(timezone.utc)
        ).order_by(AuthChallenge.created_at.desc()).first()

        if not challenge_record:
             # Fallback: try to match by challenge string if user_id wasn't saved (e.g. resident key flow?)
             # But here we used username flow.
             raise Exception("Challenge not found or expired")

        # Find the credential used
        credential_id_bytes = base64url_to_bytes(response_data['id'])
        credential_id_str = base64.urlsafe_b64encode(credential_id_bytes).decode().rstrip('=')

        credential = db.query(UserCredential).filter(
            UserCredential.credential_id == credential_id_str,
            UserCredential.user_id == user.id
        ).first()

        if not credential:
            raise Exception("Credential not registered for this user")

        try:
            verification = verify_authentication_response(
                credential=AuthenticationCredential.parse_obj(response_data),
                expected_challenge=base64url_to_bytes(challenge_record.challenge),
                expected_origin=ORIGIN,
                expected_rp_id=RP_ID,
                credential_public_key=base64url_to_bytes(credential.public_key),
                credential_current_sign_count=credential.sign_count,
            )
        except Exception as e:
            logger.error(f"Login verification failed: {e}")
            raise e

        # Update sign count
        credential.sign_count = verification.new_sign_count
        credential.last_used_at = datetime.now(timezone.utc)

        db.delete(challenge_record)
        db.commit()

        return user
