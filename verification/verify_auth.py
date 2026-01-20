from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1. Test Gate Page
            print('Navigating to http://localhost:3000')
            page.goto('http://localhost:3000')
            page.wait_for_selector('input[type="password"]')
            print('Gate page loaded')
            page.screenshot(path='/home/jules/verification/gate.png')

            # Enter Gate Password
            page.fill('input[type="password"]', '7777')
            page.click('button[type="submit"]')

            # 2. Test Auth Page (Login/Register)
            page.wait_for_selector('h2:has-text("ログイン")')
            print('Auth page loaded (Login)')
            page.screenshot(path='/home/jules/verification/auth_login.png')

            # Switch to Register
            page.click('button:has-text("新規登録はこちら")')
            page.wait_for_selector('h2:has-text("新規登録")')
            print('Auth page loaded (Register)')
            page.screenshot(path='/home/jules/verification/auth_register.png')

            # Note: Cannot fully test WebAuthn flow in headless without virtual authenticator setup,
            # but UI presence confirms integration.

        except Exception as e:
            print(f'Error: {e}')
            page.screenshot(path='/home/jules/verification/error.png')
        finally:
            browser.close()

if __name__ == "__main__":
    run()
