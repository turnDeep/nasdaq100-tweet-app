from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Capturing Gate Screen...")
            page.goto("http://localhost:3000")
            page.wait_for_selector('input[type="password"]')
            page.screenshot(path="verification/gate.png")

            print("Entering Gate Password...")
            page.fill('input[type="password"]', '7777')
            page.click('button[type="submit"]')

            print("Capturing Login Screen...")
            page.wait_for_selector('h2:has-text("ログイン")')
            page.screenshot(path="verification/auth_login.png")

            print("Capturing Register Screen...")
            page.click('button:has-text("新規登録はこちら")')
            page.wait_for_selector('h2:has-text("新規登録")')
            page.screenshot(path="verification/auth_register.png")

            # Simulate Login for Dashboard
            print("Simulating Login for Dashboard...")

            # Since we can't perform real WebAuthn in headless easily without mocking the browser api,
            # we will mock the API response for /api/auth/me to return a fake user
            # and inject the necessary cookie if needed, or rely on the frontend polling.

            # Mock the /api/auth/me endpoint
            page.route("**/api/auth/me", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='{"id": "fake-user", "username": "DemoUser", "profile_image": "https://ui-avatars.com/api/?name=DemoUser&background=random"}'
            ))

            # Reload page to trigger the auth check
            page.reload()

            # Wait for dashboard elements
            page.wait_for_selector('.chart-container', timeout=30000)

            # Open User Menu
            page.click('img[alt="DemoUser"]')
            time.sleep(0.5) # Wait for popup

            print("Capturing Dashboard...")
            page.screenshot(path="verification/dashboard_auth.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
