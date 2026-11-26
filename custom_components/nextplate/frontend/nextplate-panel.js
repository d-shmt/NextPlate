class EssensplanerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._meals = {};
    this._startDate = this._getMondayOfWeek(this._getToday());
    this._dragData = null;
    this._rendered = false;
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._renderShell();
      this._loadMeals();
    }
  }

  _getToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  _formatIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  _formatDisplay(d) {
    return d.toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
  }

  _addDays(d, days) {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
  }

  _getMondayOfWeek(d) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  _getIsoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  async _loadMeals() {
    if (!this._hass) return;
    try {
      const res = await this._hass.callWS({ type: "nextplate/get_meals" });
      this._meals = res?.meals || {};
      this._renderDays();
    } catch (err) {
      console.error("Essensplaner: Fehler beim Laden", err);
    }
  }

  async _saveMeal(dateStr, slot, meal) {
    if (!this._hass) return;
    const trimmed = meal.trim();
    if (!trimmed) {
      await this._deleteMeal(dateStr, slot);
      return;
    }
    await this._hass.callService("nextplate", "set_meal", {
      date: dateStr,
      slot,
      meal: trimmed,
      carry_over: slot === "abend",
    });
    await this._loadMeals();
  }

  async _deleteMeal(dateStr, slot) {
    if (!this._hass) return;
    await this._hass.callService("nextplate", "delete_meal", {
      date: dateStr,
      slot,
      carry_over: false,
    });
    await this._loadMeals();
  }

  async _moveOrSwapMeal(srcDate, srcSlot, srcMeal, dstDate, dstSlot, dstMeal) {
    if (!this._hass) return;
    if (srcDate === dstDate && srcSlot === dstSlot) return;

    await this._hass.callService("nextplate", "set_meal", {
      date: dstDate,
      slot: dstSlot,
      meal: srcMeal,
      carry_over: dstSlot === "abend",
    });

    if (dstMeal && dstMeal.trim()) {
      await this._hass.callService("nextplate", "set_meal", {
        date: srcDate,
        slot: srcSlot,
        meal: dstMeal.trim(),
        carry_over: srcSlot === "abend",
      });
    } else {
      await this._hass.callService("nextplate", "delete_meal", {
        date: srcDate,
        slot: srcSlot,
        carry_over: false,
      });
    }

    await this._loadMeals();
  }

  _renderShell() {
    if (this._rendered) return;
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100vh;
          background: var(--primary-background-color, #111);
          color: var(--primary-text-color, #fff);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          box-sizing: border-box;
        }
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 16px 24px;
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, #fff);
        }
        .toolbar h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 500;
        }
        .title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .kw-badge {
          font-size: 13px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          letter-spacing: 0.02em;
        }
        .nav {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .nav button {
          background: rgba(255, 255, 255, 0.16);
          color: inherit;
          border: none;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
        }
        .nav button:hover {
          background: rgba(255, 255, 255, 0.26);
        }
        .content {
          padding: 20px 24px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .hint {
          margin-bottom: 16px;
          font-size: 13px;
          color: var(--secondary-text-color, #aaa);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 16px;
        }
        .card {
          background: var(--card-background-color, #1c1c1c);
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .card.today {
          border-color: var(--primary-color, #03a9f4);
          box-shadow: 0 0 0 1px var(--primary-color, #03a9f4);
        }
        .day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 600;
          font-size: 16px;
        }
        .today-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .slot {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .slot-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color, #aaa);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .carry-badge {
          font-size: 11px;
          text-transform: none;
          letter-spacing: normal;
          opacity: 0.85;
        }
        .input-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        input[type="text"] {
          flex: 1;
          min-width: 0;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.18));
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
          color: var(--primary-text-color, #fff);
          font-size: 14px;
          outline: none;
        }
        input[type="text"]:focus {
          border-color: var(--primary-color, #03a9f4);
        }
        .clear-btn {
          background: transparent;
          border: none;
          color: var(--secondary-text-color, #aaa);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 4px 6px;
          border-radius: 6px;
        }
        .clear-btn:hover {
          color: var(--error-color, #f44336);
          background: rgba(244, 67, 54, 0.12);
        }
        .slot.drag-over .input-row {
          outline: 2px dashed var(--primary-color, #03a9f4);
          outline-offset: 2px;
          border-radius: 8px;
          background: rgba(3, 169, 244, 0.08);
        }
        .meal-chip {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.18));
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.08));
          color: var(--primary-text-color, #fff);
          font-size: 14px;
          cursor: grab;
          user-select: none;
          transition: opacity 0.15s ease, border-color 0.15s ease;
        }
        .meal-chip:hover {
          border-color: var(--primary-color, #03a9f4);
        }
        .meal-chip.dragging {
          opacity: 0.45;
          cursor: grabbing;
        }
        .drag-handle {
          color: var(--secondary-text-color, #aaa);
          font-size: 14px;
          line-height: 1;
          letter-spacing: -1px;
          flex-shrink: 0;
        }
        .meal-text {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: text;
        }
      </style>
      <div class="toolbar">
        <div class="title-group">
          <h1>NextPlate</h1>
          <span class="kw-badge" id="kw-badge"></span>
        </div>
        <div class="nav">
          <button id="prev-week">‹ Vorherige</button>
          <button id="today-btn">Heute</button>
          <button id="next-week">Nächste ›</button>
        </div>
      </div>
      <div class="content">
        <div class="hint">
          Tipp: Wenn du ein <strong>Abendessen</strong> einträgst, wird es automatisch als <strong>Mittagessen für den nächsten Tag</strong> übernommen.
        </div>
        <div class="grid" id="days-grid"></div>
      </div>
    `;

    this.shadowRoot.getElementById("prev-week").addEventListener("click", () => {
      this._startDate = this._addDays(this._startDate, -7);
      this._renderDays();
    });
    this.shadowRoot.getElementById("today-btn").addEventListener("click", () => {
      this._startDate = this._getMondayOfWeek(this._getToday());
      this._renderDays();
    });
    this.shadowRoot.getElementById("next-week").addEventListener("click", () => {
      this._startDate = this._addDays(this._startDate, 7);
      this._renderDays();
    });
  }

  _renderDays() {
    const kwBadge = this.shadowRoot.getElementById("kw-badge");
    if (kwBadge) {
      kwBadge.textContent = `KW ${this._getIsoWeek(this._startDate)}`;
    }

    const grid = this.shadowRoot.getElementById("days-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const todayIso = this._formatIso(this._getToday());

    for (let i = 0; i < 7; i++) {
      const day = this._addDays(this._startDate, i);
      const iso = this._formatIso(day);
      const dayMeals = this._meals[iso] || {};
      const isToday = iso === todayIso;

      const card = document.createElement("div");
      card.className = `card${isToday ? " today" : ""}`;

      card.innerHTML = `
        <div class="day-header">
          <span>${this._formatDisplay(day)}</span>
          ${isToday ? '<span class="today-badge">Heute</span>' : ""}
        </div>
      `;

      card.appendChild(this._createSlotRow(iso, "mittag", "Mittag", dayMeals.mittag || "", false));
      card.appendChild(this._createSlotRow(iso, "abend", "Abend", dayMeals.abend || "", true));

      grid.appendChild(card);
    }
  }

  _createSlotRow(dateStr, slot, label, value, showCarryHint) {
    const wrapper = document.createElement("div");
    wrapper.className = "slot";

    const labelEl = document.createElement("div");
    labelEl.className = "slot-label";
    labelEl.innerHTML = `
      <span>${label}</span>
      ${showCarryHint ? '<span class="carry-badge">→ Morgen Mittag</span>' : ""}
    `;

    const row = document.createElement("div");
    row.className = "input-row";

    wrapper.addEventListener("dragover", (e) => {
      if (!this._dragData) return;
      if (this._dragData.dateStr === dateStr && this._dragData.slot === slot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      wrapper.classList.add("drag-over");
    });

    wrapper.addEventListener("dragleave", (e) => {
      if (!wrapper.contains(e.relatedTarget)) {
        wrapper.classList.remove("drag-over");
      }
    });

    wrapper.addEventListener("drop", (e) => {
      e.preventDefault();
      wrapper.classList.remove("drag-over");
      if (!this._dragData) return;
      const { dateStr: srcDate, slot: srcSlot, meal: srcMeal } = this._dragData;
      this._dragData = null;
      this._moveOrSwapMeal(srcDate, srcSlot, srcMeal, dateStr, slot, value);
    });

    let lastSaved = value;

    const createInput = (initialValue, autoFocus = false) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = initialValue;
      input.placeholder = `${label} planen…`;

      const commit = () => {
        if (input.value.trim() !== lastSaved.trim()) {
          lastSaved = input.value;
          this._saveMeal(dateStr, slot, input.value);
        } else if (initialValue.trim()) {
          this._renderDays();
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
        } else if (e.key === "Escape") {
          input.value = lastSaved;
          input.blur();
        }
      });
      input.addEventListener("blur", commit);

      if (autoFocus) {
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      }
      return input;
    };

    if (value.trim()) {
      const chip = document.createElement("div");
      chip.className = "meal-chip";
      chip.draggable = true;
      chip.title = "Ziehen zum Verschieben oder klicken zum Bearbeiten";

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⋮⋮";

      const textEl = document.createElement("span");
      textEl.className = "meal-text";
      textEl.textContent = value;

      chip.addEventListener("dragstart", (e) => {
        this._dragData = { dateStr, slot, meal: value };
        chip.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", value);
      });

      chip.addEventListener("dragend", () => {
        chip.classList.remove("dragging");
        this._dragData = null;
        this.shadowRoot.querySelectorAll(".slot.drag-over").forEach((el) => {
          el.classList.remove("drag-over");
        });
      });

      textEl.addEventListener("click", () => {
        const editInput = createInput(value, true);
        row.replaceChild(editInput, chip);
      });

      chip.appendChild(handle);
      chip.appendChild(textEl);
      row.appendChild(chip);
    } else {
      row.appendChild(createInput(""));
    }

    const clearBtn = document.createElement("button");
    clearBtn.className = "clear-btn";
    clearBtn.title = "Löschen";
    clearBtn.textContent = "×";
    clearBtn.addEventListener("click", () => {
      lastSaved = "";
      this._deleteMeal(dateStr, slot);
    });

    row.appendChild(clearBtn);
    wrapper.appendChild(labelEl);
    wrapper.appendChild(row);
    return wrapper;
  }
}

customElements.define("nextplate-panel", EssensplanerPanel);
