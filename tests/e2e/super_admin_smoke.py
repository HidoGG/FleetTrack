import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
EMAIL = "gabriel@gabriel.com"
PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")

        page.locator('input[type="email"]').fill(EMAIL)
        page.locator('input[type="password"]').fill(PASSWORD)
        page.get_by_role("button", name="Ingresar al panel").click()

        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=15000)
        page.wait_for_load_state("networkidle")

        plataforma_link = page.get_by_role("link", name="Plataforma")
        expect(plataforma_link).to_be_visible(timeout=15000)
        plataforma_link.click()

        page.wait_for_url(f"{BASE_URL}/super-admin", timeout=15000)
        page.wait_for_load_state("networkidle")

        expect(page.get_by_role("heading", name="Plataforma")).to_be_visible(timeout=15000)
        expect(page.get_by_role("heading", name="Empresas")).to_be_visible(timeout=15000)
        expect(page.get_by_role("heading", name="Perfiles")).to_be_visible(timeout=15000)

        page.screenshot(path=str(ARTIFACTS / "super-admin-smoke.png"), full_page=True)
        print("OK: login super_admin, sidebar Plataforma y ruta /super-admin validados")
        print(f"Screenshot: {ARTIFACTS / 'super-admin-smoke.png'}")

        browser.close()


if __name__ == "__main__":
    main()
