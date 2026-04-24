from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = "http://localhost:5173"
EMAIL = "gabriel@gabriel.com"
PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"pageerror: {err}"))

        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.locator('input[type="email"]').fill(EMAIL)
        page.locator('input[type="password"]').fill(PASSWORD)
        page.get_by_role("button", name="Ingresar al panel").click()
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=15000)
        page.wait_for_load_state("networkidle")

        page.get_by_role("link", name="Plataforma").click()
        page.wait_for_url(f"{BASE_URL}/super-admin", timeout=15000)
        page.wait_for_load_state("networkidle")

        print("buttons=", page.locator("button").all_inner_texts())
        print("headings=", page.locator("h1, h2, h3").all_inner_texts())
        print("tables=", page.locator("table").count())
        print("body=", page.locator("body").inner_text(timeout=5000))

        page.screenshot(path=str(ARTIFACTS / "super-admin-post-login-inspect.png"), full_page=True)
        print(f"Screenshot: {ARTIFACTS / 'super-admin-post-login-inspect.png'}")

        browser.close()


if __name__ == "__main__":
    main()
