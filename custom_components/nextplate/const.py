"""Constants for the Essensplaner integration."""

DOMAIN = "nextplate"
STORAGE_KEY = "nextplate_data"
STORAGE_VERSION = 1

SLOT_MITTAG = "mittag"
SLOT_ABEND = "abend"
VALID_SLOTS = (SLOT_MITTAG, SLOT_ABEND)

# Default event times for the calendar entity (hour, minute)
MITTAG_START = (12, 0)
MITTAG_END = (13, 0)
ABEND_START = (18, 30)
ABEND_END = (19, 30)

PANEL_URL = "/nextplate-panel"
PANEL_TITLE = "NextPlate"
PANEL_ICON = "mdi:silverware-fork-knife"
STATIC_URL_PATH = "/nextplate_static"
