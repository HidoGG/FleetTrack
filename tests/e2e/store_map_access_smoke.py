import os
import subprocess
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5173")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:3001/api")
SUPERADMIN_EMAIL = "gabriel@gabriel.com"
SUPERADMIN_PASSWORD = "Gabriel123!"
TEMP_PASSWORD = "Gabriel123!"
ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
CLEANUP = ROOT / "tests" / "e2e" / "cleanup_super_admin_qa.mjs"


def api_json(request_context, method: str, path: str, *, token: str | None = None, data=None, expected_status: int = 200):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = request_context.fetch(
        f"{API_BASE_URL}{path}",
        method=method,
        headers=headers,
        data=data,
    )

    if response.status != expected_status:
        raise RuntimeError(f"{method} {path} -> {response.status}: {response.text()}")

    if expected_status == 204:
        return None

    return response.json()


def run_cleanup() -> None:
    subprocess.run(
        ["node", "--env-file=.env", str(CLEANUP)],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    company_name = f"Codex QA Store Map {stamp}"
    admin_email = f"codex.superadmin.qa.store.map.admin.{stamp}@example.com"
    store_email = f"codex.superadmin.qa.store.map.user.{stamp}@example.com"
    screenshot_path = ARTIFACTS / f"store-map-access-{stamp}.png"

    with sync_playwright() as p:
        request_context = p.request.new_context()
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        try:
            superadmin_login = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            )
            superadmin_token = superadmin_login["token"]

            company = api_json(
                request_context,
                "POST",
                "/companies",
                token=superadmin_token,
                data={"name": company_name, "plan": "basic"},
                expected_status=201,
            )

            api_json(
                request_context,
                "POST",
                f"/companies/{company['id']}/profiles",
                token=superadmin_token,
                data={
                    "email": admin_email,
                    "password": TEMP_PASSWORD,
                    "role": "admin",
                    "full_name": f"Codex QA Store Map Admin {stamp}",
                },
                expected_status=201,
            )

            admin_login = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": admin_email, "password": TEMP_PASSWORD},
            )
            admin_token = admin_login["token"]

            location = api_json(
                request_context,
                "POST",
                "/stores",
                token=admin_token,
                data={
                    "name": f"Codex QA Store Map Location {stamp}",
                    "location_type": "store",
                    "address": "QA map access",
                    "is_active": True,
                    "rider_visible": True,
                    "is_temporary": True,
                },
                expected_status=201,
            )

            api_json(
                request_context,
                "POST",
                f"/companies/{company['id']}/profiles",
                token=superadmin_token,
                data={
                    "email": store_email,
                    "password": TEMP_PASSWORD,
                    "role": "store",
                    "full_name": f"Codex QA Store Map User {stamp}",
                    "location_id": location["id"],
                },
                expected_status=201,
            )

            store_login = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": store_email, "password": TEMP_PASSWORD},
            )
            capabilities = store_login["user"].get("map_access", {}).get("capabilities", [])
            if "map.view.company" in capabilities:
                raise RuntimeError("El perfil store no deberia recibir map.view.company")

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(store_email)
            page.locator('input[type="password"]').fill(TEMP_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/store/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")

            expect(page.get_by_text("Mapa en vivo")).to_have_count(0)

            page.goto(f"{BASE_URL}/map", wait_until="domcontentloaded")
            page.wait_for_url(f"{BASE_URL}/store/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")
            expect(page).to_have_url(f"{BASE_URL}/store/dashboard")

            page.screenshot(path=str(screenshot_path), full_page=True)
            print(f"OK: store sin acceso a mapa ni por menu ni por URL. Artifact: {screenshot_path}")
        finally:
            browser.close()
            request_context.dispose()
            run_cleanup()


if __name__ == "__main__":
    main()
