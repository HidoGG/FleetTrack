import os
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
EMAIL = "gabriel@gabriel.com"
PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def profile_callout(page, title: str):
    return page.locator("div").filter(has=page.get_by_text(title, exact=True)).nth(1)


def profile_filter_selects(page):
    selects = page.locator("select").all()
    role_select = None
    state_select = None
    for select in selects:
        content = " ".join(select.locator("option").all_inner_texts())
        if "Todos los roles" in content:
            role_select = select
        if "Todos los estados" in content:
            state_select = select
    return role_select, state_select


def wait_for_companies_table(page) -> None:
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="Empresas")).to_be_visible(timeout=20000)
    try:
        page.locator("table").first.wait_for(timeout=5000)
    except Exception:
        expect(page.get_by_text("Todavía no hay empresas registradas")).to_be_visible(timeout=20000)


def login_and_open_super_admin(page) -> None:
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
    wait_for_companies_table(page)


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    company_name = f"Codex QA {stamp}"
    company_name_edited = f"Codex QA Edit {stamp}"
    company_email = f"codex-qa-{stamp}@example.com"
    profile_email = f"codex.superadmin.qa.{stamp}@example.com"
    suspend_reason = f"QA suspend {stamp}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        login_and_open_super_admin(page)

        page.get_by_role("button", name="Nueva empresa").click()
        company_form = page.locator("form").first
        company_form.locator('input[name="name"]').fill(company_name)
        company_form.locator('select[name="plan"]').select_option("pro")
        company_form.locator('select[name="commercial_status"]').select_option("trial")
        company_form.get_by_role("button", name="Crear empresa").click()

        company_row = page.locator("tbody tr").filter(has_text=company_name).first
        expect(company_row).to_be_visible(timeout=20000)
        expect(company_row.get_by_text("pro")).to_be_visible()
        expect(company_row.get_by_text("Trial")).to_be_visible()

        company_row.get_by_role("button", name="Editar").click()
        edit_form = page.locator("form").first
        edit_form.locator('input[name="name"]').fill(company_name_edited)
        edit_form.locator('select[name="commercial_status"]').select_option("active")
        edit_form.locator('input[name="commercial_name"]').fill(f"Comercial {stamp}")
        edit_form.locator('input[name="email"]').fill(company_email)
        edit_form.locator('input[name="phone"]').fill("+54 9 11 5555 0000")
        edit_form.locator("#feature_full_traceability").check()
        edit_form.locator("#limit_profiles").fill("25")
        edit_form.locator("#addon_white_label").check()
        edit_form.get_by_role("button", name="Guardar cambios").click()

        edited_row = page.locator("tbody tr").filter(has_text=company_name_edited).first
        expect(edited_row).to_be_visible(timeout=20000)
        expect(page.get_by_text(company_email)).to_be_visible(timeout=20000)
        expect(edited_row.get_by_text("Activa comercialmente")).to_be_visible(timeout=20000)
        expect(edited_row.get_by_text("8 features")).to_be_visible(timeout=20000)
        expect(edited_row.get_by_text("2 addons")).to_be_visible(timeout=20000)

        edited_row.get_by_role("button", name="Ver perfiles").click()
        expect(page.get_by_role("heading", name=f"Perfiles de {company_name_edited}")).to_be_visible(timeout=15000)
        expect(page.get_by_text("Empresa seleccionada")).to_be_visible(timeout=15000)
        expect(page.get_by_text("Sin Login Todavía")).to_be_visible(timeout=15000)
        expect(page.get_by_text("Últimos Suspendidos")).to_be_visible(timeout=15000)
        expect(profile_callout(page, "Sin Login Todavía")).to_contain_text("0", timeout=15000)
        expect(profile_callout(page, "Últimos Suspendidos")).to_contain_text("0", timeout=15000)

        page.get_by_role("button", name="Nuevo perfil").click()
        profile_form = page.locator("form").first
        profile_form.locator('input[name="full_name"]').fill(f"Codex QA Admin {stamp}")
        profile_form.locator('input[name="email"]').fill(profile_email)
        profile_form.locator('input[name="password"]').fill("Gabriel123!")
        profile_form.locator('select[name="role"]').select_option("admin")
        profile_form.locator('input[name="phone"]').fill("+54 9 11 1111 1111")
        profile_form.get_by_role("button", name="Crear perfil").click()

        profile_row = page.locator("tbody tr").filter(has_text=profile_email).first
        expect(profile_row).to_be_visible(timeout=20000)
        expect(profile_row.get_by_role("cell", name="admin", exact=True)).to_be_visible()
        expect(page.get_by_text("Codex QA Admin", exact=False).first).to_be_visible(timeout=15000)
        expect(profile_row.get_by_text("Todavía sin primer acceso")).to_be_visible(timeout=15000)
        expect(profile_callout(page, "Sin Login Todavía")).to_contain_text("1", timeout=15000)
        expect(profile_callout(page, "Sin Login Todavía").get_by_text("Codex QA Admin", exact=False).first).to_be_visible(timeout=15000)

        role_select, state_select = profile_filter_selects(page)
        state_select.select_option("suspended")
        expect(page.get_by_text("No hay perfiles que coincidan con los filtros actuales.")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="Limpiar filtros").click()
        expect(profile_row).to_be_visible(timeout=15000)

        role_select, state_select = profile_filter_selects(page)
        role_select.select_option("admin")
        expect(page.get_by_text("Rol: admin")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="Resetear").click()
        expect(profile_row).to_be_visible(timeout=15000)

        profile_row.get_by_role("button", name="Suspender").click()
        page.locator("#suspend_reason").fill(suspend_reason)
        page.locator('button[type="submit"].btn-danger').click()
        expect(profile_row.get_by_text("Suspendido")).to_be_visible(timeout=15000)
        expect(page.get_by_text(suspend_reason).first).to_be_visible(timeout=15000)
        expect(profile_callout(page, "Últimos Suspendidos")).to_contain_text("1", timeout=15000)
        expect(profile_callout(page, "Últimos Suspendidos").get_by_text("Codex QA Admin", exact=False).first).to_be_visible(timeout=15000)
        expect(profile_callout(page, "Últimos Suspendidos").get_by_text(suspend_reason, exact=False).first).to_be_visible(timeout=15000)

        role_select, state_select = profile_filter_selects(page)
        state_select.select_option("suspended")
        suspended_profile_row = page.locator("tbody tr").filter(has_text=profile_email).first
        expect(suspended_profile_row).to_be_visible(timeout=15000)
        page.get_by_role("button", name="Resetear").click()
        expect(profile_row).to_be_visible(timeout=15000)

        profile_row.get_by_role("button", name="Activar").click()
        expect(profile_row.get_by_text("Activo")).to_be_visible(timeout=15000)

        edited_row = page.locator("tbody tr").filter(has_text=company_name_edited).first
        edited_row.get_by_role("button", name="Suspender").click()
        page.get_by_role("button", name="Confirmar suspensión").click()
        suspended_row = page.locator("tbody tr").filter(has_text=company_name_edited).first
        expect(suspended_row.locator(".badge")).to_have_text("Suspendida", timeout=15000)

        suspended_row.get_by_role("button", name="Activar", exact=True).click()
        reactivated_row = page.locator("tbody tr").filter(has_text=company_name_edited).first
        expect(reactivated_row.locator(".badge")).to_have_text("Activa", timeout=15000)

        mobile_page = browser.new_page(viewport={"width": 390, "height": 844})
        login_and_open_super_admin(mobile_page)
        expect(mobile_page.get_by_role("button", name="Nueva empresa")).to_be_visible(timeout=15000)
        expect(mobile_page.get_by_text("En tablet o móvil podés deslizar horizontalmente la tabla")).to_be_visible(timeout=15000)
        mobile_page.screenshot(path=str(ARTIFACTS / "super-admin-mobile-smoke.png"), full_page=True)
        mobile_page.close()

        page.screenshot(path=str(ARTIFACTS / "super-admin-extended-smoke.png"), full_page=True)
        print("OK: empresa creada/editada, widgets operativos y filtros rápidos cubiertos, perfil admin creado, perfil suspendido/reactivado, empresa suspendida/reactivada y chequeo móvil básico")
        print(f"Company: {company_name_edited}")
        print(f"Profile: {profile_email}")
        print(f"Screenshot: {ARTIFACTS / 'super-admin-extended-smoke.png'}")
        print(f"Mobile screenshot: {ARTIFACTS / 'super-admin-mobile-smoke.png'}")

        browser.close()


if __name__ == "__main__":
    main()
