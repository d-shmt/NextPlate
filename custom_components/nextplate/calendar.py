"""Calendar platform for Essensplaner."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import (
    ABEND_END,
    ABEND_START,
    DOMAIN,
    MITTAG_END,
    MITTAG_START,
    SLOT_ABEND,
    SLOT_MITTAG,
)
from .store import EssensplanerStore


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Essensplaner calendar platform."""
    store: EssensplanerStore = hass.data[DOMAIN]["store"]
    async_add_entities([EssensplanerCalendarEntity(store)])


class EssensplanerCalendarEntity(CalendarEntity):
    """Calendar entity representing Mittag and Abend meals."""

    _attr_has_entity_name = False
    _attr_name = "NextPlate"
    _attr_unique_id = f"{DOMAIN}_calendar"
    _attr_icon = "mdi:silverware-fork-knife"

    def __init__(self, store: EssensplanerStore) -> None:
        """Initialize the calendar entity."""
        self._store = store
        self._unsub_listener = None

    async def async_added_to_hass(self) -> None:
        """Subscribe to store updates."""
        self._unsub_listener = self._store.add_listener(self.async_write_ha_state)

    async def async_will_remove_from_hass(self) -> None:
        """Unsubscribe from store updates."""
        if self._unsub_listener:
            self._unsub_listener()
            self._unsub_listener = None

    @property
    def event(self) -> CalendarEvent | None:
        """Return the current or next upcoming meal event."""
        now = dt_util.now()
        events = self._build_events_for_range(now, now + timedelta(days=14))
        for ev in events:
            if ev.end > now:
                return ev
        return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return calendar events within a datetime range."""
        return self._build_events_for_range(start_date, end_date)

    def _build_events_for_range(
        self, start_dt: datetime, end_dt: datetime
    ) -> list[CalendarEvent]:
        """Build CalendarEvent objects for all meals in the given range."""
        tz = dt_util.get_default_time_zone()
        current_day: date = dt_util.as_local(start_dt).date()
        last_day: date = dt_util.as_local(end_dt).date()

        events: list[CalendarEvent] = []
        while current_day <= last_day:
            day_meals = self._store.get_day(current_day)
            for slot, start_hm, end_hm, label in (
                (SLOT_MITTAG, MITTAG_START, MITTAG_END, "Mittag"),
                (SLOT_ABEND, ABEND_START, ABEND_END, "Abend"),
            ):
                meal = day_meals.get(slot)
                if not meal:
                    continue
                ev_start = datetime.combine(
                    current_day, time(*start_hm), tzinfo=tz
                )
                ev_end = datetime.combine(
                    current_day, time(*end_hm), tzinfo=tz
                )
                if ev_end > start_dt and ev_start < end_dt:
                    events.append(
                        CalendarEvent(
                            start=ev_start,
                            end=ev_end,
                            summary=f"{label}: {meal}",
                        )
                    )
            current_day += timedelta(days=1)

        return events
