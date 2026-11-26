"""Persistent storage and meal-planning logic for Essensplaner."""
from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import SLOT_ABEND, SLOT_MITTAG, STORAGE_KEY, STORAGE_VERSION, VALID_SLOTS


class EssensplanerStore:
    """Manage meal plan data in Home Assistant storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY
        )
        self._data: dict[str, dict[str, str]] = {}
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        """Load data from storage."""
        stored = await self._store.async_load()
        if isinstance(stored, dict) and isinstance(stored.get("meals"), dict):
            self._data = stored["meals"]
        else:
            self._data = {}

    async def async_save(self) -> None:
        """Persist data to storage and notify listeners."""
        await self._store.async_save({"meals": self._data})
        for listener in list(self._listeners):
            listener()

    def add_listener(self, callback: Callable[[], None]) -> Callable[[], None]:
        """Register a callback for data changes."""
        self._listeners.append(callback)

        def _remove() -> None:
            if callback in self._listeners:
                self._listeners.remove(callback)

        return _remove

    def get_all_meals(self) -> dict[str, dict[str, str]]:
        """Return a copy of all stored meals."""
        return {d: dict(slots) for d, slots in self._data.items()}

    def get_day(self, day: date) -> dict[str, str]:
        """Return meals for a specific date."""
        return dict(self._data.get(day.isoformat(), {}))

    async def async_set_meal(
        self,
        day: date,
        slot: str,
        meal: str,
        carry_over: bool = True,
    ) -> None:
        """Set or clear a meal for a given day and slot.

        When slot is 'abend' and carry_over is True, the next day's 'mittag'
        is automatically updated to the same meal.
        """
        if slot not in VALID_SLOTS:
            raise ValueError(f"Invalid slot: {slot}")

        day_key = day.isoformat()
        cleaned = meal.strip()

        if not cleaned:
            await self.async_delete_meal(day, slot, carry_over=carry_over)
            return

        self._data.setdefault(day_key, {})[slot] = cleaned

        if slot == SLOT_ABEND and carry_over:
            next_day_key = (day + timedelta(days=1)).isoformat()
            self._data.setdefault(next_day_key, {})[SLOT_MITTAG] = cleaned

        await self.async_save()

    async def async_delete_meal(
        self,
        day: date,
        slot: str,
        carry_over: bool = False,
    ) -> None:
        """Delete a meal for a given day and slot."""
        if slot not in VALID_SLOTS:
            raise ValueError(f"Invalid slot: {slot}")

        day_key = day.isoformat()
        day_meals = self._data.get(day_key)
        if not day_meals or slot not in day_meals:
            return

        old_meal = day_meals.pop(slot)
        if not day_meals:
            self._data.pop(day_key, None)

        if slot == SLOT_ABEND and carry_over:
            next_day_key = (day + timedelta(days=1)).isoformat()
            next_meals = self._data.get(next_day_key)
            if next_meals and next_meals.get(SLOT_MITTAG) == old_meal:
                next_meals.pop(SLOT_MITTAG, None)
                if not next_meals:
                    self._data.pop(next_day_key, None)

        await self.async_save()
