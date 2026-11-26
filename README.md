# NextPlate

Fast meal planning for Home Assistant built around one simple workflow: **cook dinner once, automatically plan it for tomorrow's lunch.**

## Features
- **Automatic Carry-Over**: Setting a dinner (`abend`) automatically fills the next day's lunch (`mittag`).
- **Calendar Entity (`calendar.nextplate`)**: Displays planned lunches and dinners directly in your Home Assistant calendar.
- **Built-in Sidebar Dashboard**: Adds a **NextPlate** panel to the Home Assistant sidebar for quick 7-day planning.
- **Services**: `nextplate.set_meal` and `nextplate.delete_meal` for automations and scripts.

## Installation
1. Copy `custom_components/nextplate` into your Home Assistant `config/custom_components/` directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and search for **NextPlate**.
