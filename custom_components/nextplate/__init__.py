"""The Essensplaner integration."""
from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    SLOT_ABEND,
    STATIC_URL_PATH,
    VALID_SLOTS,
)
from .store import EssensplanerStore

PLATFORMS: list[Platform] = [Platform.CALENDAR]

SERVICE_SET_MEAL = "set_meal"
SERVICE_DELETE_MEAL = "delete_meal"

SET_MEAL_SCHEMA = vol.Schema(
    {
        vol.Optional("date"): cv.date,
        vol.Required("slot", default=SLOT_ABEND): vol.In(VALID_SLOTS),
        vol.Required("meal"): cv.string,
        vol.Optional("carry_over", default=True): cv.boolean,
    }
)

DELETE_MEAL_SCHEMA = vol.Schema(
    {
        vol.Optional("date"): cv.date,
        vol.Required("slot"): vol.In(VALID_SLOTS),
        vol.Optional("carry_over", default=False): cv.boolean,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Essensplaner from a config entry."""
    store = EssensplanerStore(hass)
    await store.async_load()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["store"] = store

    async def handle_set_meal(call: ServiceCall) -> None:
        day: date = call.data.get("date") or dt_util.now().date()
        slot: str = call.data["slot"]
        meal: str = call.data["meal"]
        carry_over: bool = call.data.get("carry_over", True)
        await store.async_set_meal(day, slot, meal, carry_over=carry_over)
        hass.bus.async_fire(f"{DOMAIN}_updated")

    async def handle_delete_meal(call: ServiceCall) -> None:
        day: date = call.data.get("date") or dt_util.now().date()
        slot: str = call.data["slot"]
        carry_over: bool = call.data.get("carry_over", False)
        await store.async_delete_meal(day, slot, carry_over=carry_over)
        hass.bus.async_fire(f"{DOMAIN}_updated")

    if not hass.services.has_service(DOMAIN, SERVICE_SET_MEAL):
        hass.services.async_register(
            DOMAIN, SERVICE_SET_MEAL, handle_set_meal, schema=SET_MEAL_SCHEMA
        )

    if not hass.services.has_service(DOMAIN, SERVICE_DELETE_MEAL):
        hass.services.async_register(
            DOMAIN, SERVICE_DELETE_MEAL, handle_delete_meal, schema=DELETE_MEAL_SCHEMA
        )

    websocket_api.async_register_command(hass, ws_get_meals)

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                STATIC_URL_PATH,
                str(frontend_dir),
                cache_headers=False,
            )
        ]
    )

    panel_file = frontend_dir / "nextplate-panel.js"
    panel_version = int(panel_file.stat().st_mtime) if panel_file.exists() else 0

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="nextplate-panel",
        frontend_url_path=DOMAIN,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL_PATH}/nextplate-panel.js?v={panel_version}",
        require_admin=False,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.pop(DOMAIN, None)
    return unload_ok


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nextplate/get_meals",
    }
)
@websocket_api.async_response
async def ws_get_meals(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all planned meals over WebSocket."""
    store: EssensplanerStore = hass.data[DOMAIN]["store"]
    connection.send_result(msg["id"], {"meals": store.get_all_meals()})
