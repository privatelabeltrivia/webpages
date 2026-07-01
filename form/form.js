import {
  insertRegistrationSubmission,
  insertScoringRoundSubmission,
} from "../supabase/supabase.js";

// Configuration Constants
const CONFIG = {
  API_ENDPOINT:
    "https://script.google.com/macros/s/AKfycbzSKsXsSkuCtLr3kC8OxIcFqdQdakD7Ux1_-07K7KSMYjt0DDCSyj2qX2h3OG1o4OU9/exec",
  API_SUPABASE: "",
  LOADING_TIMEOUT: 60000,
  LOADING_DISPLAY_TIME: 2000,
  MAX_VENUE_LIST_HEIGHT: 20,
  CACHE_EXPIRY_MS: 6 * 60 * 60 * 1000,
};

const defaultLogoSrc = "../icons/img-default.png";

// Storage Key Generator
const STORAGE_KEYS = {
  SYSTEM: {
    EMAIL: "plt_system_email",
    FONT_SIZE: "plt_system_font_size",
    VISITED_VENUES: "plt_system_visited_venues",
    THEME: "plt_system_theme",
  },
  getVenueKeys: (venueId) => ({
    TEAM_NAME: `plt_venue_${venueId}_team_name`,
    REGISTRATION_TIME: `plt_venue_${venueId}_registration_time`,
    COMPLETED_ROUNDS: `plt_venue_${venueId}_completed_rounds`,
    DOUBLE_ROUND: `plt_venue_${venueId}_bonus_round`,
    LOGOSRC: `plt_venue_${venueId}_logo_src`,
    PRIMARY_COLOR: `plt_venue_${venueId}_primary_color`,
    SECONDARY_COLOR: `plt_venue_${venueId}_secondary_color`,
  }),
  getRoundPrefix: (venueId, roundNum) => `plt_round_${venueId}_${roundNum}_`,
};

// Cache Manager Utility
const CacheManager = {
  set: (key, value) => {
    const result =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    localStorage.setItem(key, result);
    console.log(`Cache set: ${key} = ${result}`);
  },
  get: (key, defaultValue = null) => {
    const value = localStorage.getItem(key);

    if (!value) return defaultValue;
    try {
      const parsed = JSON.parse(value);
      console.log(`Cache parsed JSON for key ${key}:`, parsed);
      return parsed;
    } catch {
      const stringValue = String(value);
      console.log(`Cache returned string for key ${key}:`, stringValue);
      return stringValue;
    }
  },
  remove: (key) => {
    localStorage.removeItem(key);
    console.log(`Cache removed: ${key}`);
  },
  clear: (prefix) => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
    console.log(`Cache cleared: ${prefix}*`);
  },
};

const VenueHistory = {
  addVenue: (venueId, venueName) => {
    const rawData = CacheManager.get(STORAGE_KEYS.SYSTEM.VISITED_VENUES);
    let history = Array.isArray(rawData) ? rawData : [];
    history = history.filter((v) => v.id !== venueId);
    history.push({ id: venueId, name: venueName });
    history.sort((a, b) => a.name.localeCompare(b.name));
    CacheManager.set(STORAGE_KEYS.SYSTEM.VISITED_VENUES, history);
  },
  getVenues: () => {
    const rawData = CacheManager.get(STORAGE_KEYS.SYSTEM.VISITED_VENUES);
    return rawData || [];
  },
  cleanupVenues: (allVenues) => {
    const currentHistory = VenueHistory.getVenues();
    if (!allVenues || allVenues.length === 0) return currentHistory;

    // Create a list of valid IDs from the backend
    const validVenueIds = allVenues.map((v) => v.id);

    // Keep only venues that exist in the valid list
    const cleanedHistory = currentHistory.filter((h) =>
      validVenueIds.includes(h.id),
    );

    // If the length changed, something was deleted
    if (cleanedHistory.length !== currentHistory.length) {
      console.log("Cleanup: Removing stale venues from history.");
      CacheManager.set(STORAGE_KEYS.SYSTEM.VISITED_VENUES, cleanedHistory);
    }
  },
};

const params = new URLSearchParams(window.location.search);
const vId = params.get("venue") || "";
const currentRound = parseInt(params.get("round") || 0, 10);

const venueKeys = STORAGE_KEYS.getVenueKeys(vId);
const roundKeyPrefix = STORAGE_KEYS.getRoundPrefix(vId, currentRound);

const HEADER_TEAM_NAME = "TEAM NAME";
const HEADER_DOUBLE_ROUND = "DOUBLE-POINTS CHOICE";

// Global Data Variable
let appData = {};

getFormData();

function renderPage(data) {
  console.log("1. Set Theme Color");
  if (data.themeColor) {
    document.documentElement.style.setProperty(
      "--plt-color-primary",
      data.themeColor,
    );
  }

  console.log("2. Set Basic Text");
  document.getElementById("venue-name").textContent = data.venueName || "";
  document.getElementById("success-venue-name").textContent =
    data.venueName || "";

  document.title = `${data.venueName || "Trivia Venue"} - ${data.roundNum === 0 ? "Registration" : "Round " + data.roundNum}`;

  document.getElementById("round-title").textContent = data.roundTitle || "";
  document.getElementById("app-version").textContent =
    "Build: " + (data.appVersion || "");

  const roundTitleContainer = document.getElementById("round-title-container");
  if (!data.roundTitle) toggleVisibility(roundTitleContainer, false);

  console.log("3. Set Images");
  const logoSrc = data.logoSrc || defaultLogoSrc || "";
  CacheManager.set(venueKeys.LOGOSRC, logoSrc);

  CacheManager.set(venueKeys.PRIMARY_COLOR, data.themeColor || "");

  const headerLogo = document.getElementById("header-logo");
  if (logoSrc) headerLogo.src = logoSrc;
  const loadingLogo = document.getElementById("loading-logo");
  if (logoSrc) loadingLogo.src = logoSrc;
  const successLogo = document.getElementById("success-logo");
  if (logoSrc) successLogo.src = logoSrc;

  console.log("4. Populate Venue List");
  if (data.allVenues && Array.isArray(data.allVenues)) {
    const venueList = document.getElementById("venue-list");
    venueList.innerHTML = "";
    data.allVenues.forEach((venue) => {
      const option = createSelectOption(venue.id, venue.name, {
        padding: "8px",
        borderBottom: "1px solid var(--plt-color-gray-light)",
      });
      venueList.appendChild(option);
    });
    venueList.size = Math.min(
      data.allVenues.length,
      CONFIG.MAX_VENUE_LIST_HEIGHT,
    );
  }

  console.log("5. Populate Round Description");
  if (data.roundDescription) {
    const descDiv = document.getElementById("round-description");
    descDiv.innerHTML = data.roundDescription;
    toggleVisibility(descDiv, true);
  }

  console.log("6. Populate Questions");
  if (data.questions && Array.isArray(data.questions)) {
    renderQuestions(data);
    restoreFormFromCache();
  }

  console.log("7. Dynamic Progress Tracker");
  const tracker = document.getElementById("progress-tracker");
  tracker.innerHTML = "";
  if (data.availableRounds) {
    data.availableRounds.forEach((rNum) => {
      const dot = document.createElement("div");
      dot.className = "round-status-dot";
      dot.id = `dot-${rNum}`;
      dot.textContent = rNum === 0 ? "R" : rNum;
      tracker.appendChild(dot);
    });
  }

  console.log("8. Populate Navigation Pills");
  if (data.availableRounds && data.isValidVenue) {
    renderNavPills(data);
  }

  console.log("9. Show/Hide Sections based on validation");
  const venueNotFound = document.getElementById("venue-not-found");
  const venueSelectContainer = document.getElementById("venue-selection");
  const roundNotFound = document.getElementById("round-not-found");
  const triviaForm = document.getElementById("trivia-form");
  const roundSelectionPrompt = document.getElementById(
    "round-selection-prompt",
  );
  const standardFormLink = document.getElementById("standardFormLink");

  console.log("9a. Venue Validation:", data.isValidVenue);
  console.log("9b. Round Validation:", data.isValidRound);

  if (!data.isValidVenue) {
    toggleVisibility(venueNotFound, true);
    toggleVisibility(venueSelectContainer, true);
    toggleVisibility(triviaForm, false);
  } else {
    toggleVisibility(venueNotFound, false);
    toggleVisibility(venueSelectContainer, false);
    toggleVisibility(roundSelectionPrompt, true);

    if (!data.isValidRound) {
      toggleVisibility(roundNotFound, true);
      toggleVisibility(triviaForm, false);
    } else {
      toggleVisibility(roundNotFound, false);
      toggleVisibility(triviaForm, true);
    }
  }

  if (data.directFormUrl) {
    standardFormLink.href = data.directFormUrl + "/viewform";
    toggleVisibility(standardFormLink, true);
  }

  console.log("10. Hide Overlay");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) toggleVisibility(loadingOverlay, false);

  updateDuplicateStates();
  updateProgressBar();
  updateCompletedRoundPills();
}

function renderQuestions(data) {
  const container = document.getElementById("questionsContainer");
  container.innerHTML = "";

  const cacheEmail = CacheManager.get(STORAGE_KEYS.SYSTEM.EMAIL) || "";
  console.log("Cache Email:", cacheEmail);
  const appDataEmail = appData.emailFromUrl || "";
  console.log("App Data Email:", appDataEmail);
  const urlEmail =
    new URLSearchParams(window.location.search).get("email") || "";
  console.log("Email from App Data:", appDataEmail);
  const foundEmail = appDataEmail || urlEmail || cacheEmail;
  console.log("Email found:", foundEmail);

  // Add Email field if needed
  if (!foundEmail || data.roundNum === 0) {
    const emailBlock = document.createElement("div");
    emailBlock.className = "q-block";
    emailBlock.innerHTML = `
          <label for="userEmail" class="q-title">EMAIL ADDRESS<span class="required-asterisk">*</span></label>
          <input type="email" name="email" id="userEmail" placeholder="your@email.com" required>
        `;
    container.appendChild(emailBlock);
    const emailInput = document.getElementById("userEmail");
    emailInput.value = foundEmail;
  } else {
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.name = "email";
    hiddenInput.id = "userEmail";
    hiddenInput.value = foundEmail;
    container.appendChild(hiddenInput);
  }

  // Add Questions
  data.questions.forEach((q) => {
    const qBlock = document.createElement("div");
    qBlock.className = "q-block";

    let label = `<label for="q_${q.id}" class="q-title">${q.label}`;
    if (q.required) label += '<span class="required-asterisk">*</span>';
    label += "</label>";

    let description = "";
    if (q.description) {
      description = `<p class="q-description">${q.description}</p>`;
    }

    let input = "";
    if (q.type === "select" || (q.options && q.options.length > 0)) {
      input = `<select name="${q.id}" id="q_${q.id}" ${q.required ? "required" : ""} class="q-input">
            <option value="" selected>${q.placeholder || "Choose..."}</option>`;
      q.options.forEach((opt) => {
        input += `<option value="${opt}" data-label="${opt}">${opt}</option>`;
      });
      input += "</select>";
    } else {
      input = `<input type="${q.type || "text"}" name="${q.id}" id="q_${q.id}" ${q.required ? "required" : ""} ${q.maxlength ? 'maxLength="' + q.maxlength + '"' : ""} placeholder="${q.placeholder || "Type answer here..."}" class="q-input">`;
    }

    let warning = "";
    if (q.maxlength) {
      warning = `<div id="warning_${q.id}" class="q-warning">Team name cannot exceed ${q.maxlength} characters.</div>`;
    }

    qBlock.innerHTML = label + description + input + warning;
    container.appendChild(qBlock);

    if (q.maxlength) {
      const field = qBlock.querySelector("input");
      const warningEl = document.getElementById(`warning_${q.id}`);

      field.addEventListener("input", () => {
        warningEl.style.display =
          field.value.length >= q.maxlength ? "block" : "none";
      });
    }
  });
}

function renderNavPills(data) {
  const container = document.getElementById("round-navigation");
  container.innerHTML = "";

  const completedRounds = CacheManager.get(venueKeys.COMPLETED_ROUNDS, []);

  data.availableRounds.forEach((rNum) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `pill-${rNum}`;
    button.className = `round-tab ${data.roundNum === rNum ? "round-tab--active" : "round-tab--inactive"}`;
    button.textContent = rNum === 0 ? "R" : rNum;
    button.setAttribute("role", "tab");
    button.setAttribute(
      "aria-selected",
      data.roundNum === rNum ? "true" : "false",
    );
    button.addEventListener("click", () => handleNavClick(rNum));
    container.appendChild(button);
  });
}

function renderVenueButtons(history) {
  const container = document.getElementById("venue-history-container");
  const list = document.getElementById("venue-history-list");
  list.innerHTML = ""; // Clear existing

  history.forEach((venue) => {
    const btn = document.createElement("button");
    btn.innerText = venue.name;
    btn.onclick = () => (window.location.search = `?venue=${venue.id}`);
    list.appendChild(btn);
  });

  container.classList.remove("hidden");
}

function restoreFormFromCache() {
  console.log("Restoring form data from cache...");
  const form = document.getElementById("trivia-form");
  if (!form) return;

  form.querySelectorAll(".q-block").forEach((block) => {
    const input = block.querySelector("input");
    const select = block.querySelector("select");
    const label = block.querySelector("label");

    const field = input || select;
    if (!field) return;

    // 1. Handle "Team Name" logic
    if (label && label.textContent.toUpperCase().includes(HEADER_TEAM_NAME)) {
      const teamVal = CacheManager.get(venueKeys.TEAM_NAME);
      if (teamVal) field.value = teamVal;
    }

    // 2. Restore cached value
    const key = roundKeyPrefix + field.name;
    const cached = CacheManager.get(key);
    console.log(`Restoring ${field.name} from cache with key ${key}:`, cached);
    if (cached) field.value = cached;

    if (field.maxLength) {
      const warningEl = document.getElementById(`warning_${field.name}`);
      if (warningEl)
        warningEl.style.display =
          field.value.length >= field.maxLength ? "block" : "none";
    }

    if (select) toggleSelectColor(select);
  });

  console.log("Form restored");
}

async function getFormData() {
  try {
    console.log("Fetching form data from Apps Script...");
    const venueId = vId;
    const round = currentRound;

    const url = new URL(CONFIG.API_ENDPOINT);
    url.searchParams.append("venueId", venueId);
    url.searchParams.append("round", round);
    url.searchParams.append("action", "template");

    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
    });
    console.log("Raw response from Apps Script:", response);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    appData = await response.json();
    console.log("Data received from Apps Script:", appData);

    if (appData.isValidVenue) {
      VenueHistory.addVenue(appData.venueId, appData.venueName);
      renderPage(appData);
    } else {
      document.title = "Trivia Venue - Not Found";

      const headerLogo = document.getElementById("header-logo");
      headerLogo.src = defaultLogoSrc;

      VenueHistory.cleanupVenues(appData.allVenues);

      const history = VenueHistory.getVenues();
      if (history.length > 1) {
        renderVenueButtons(history);
      } else if ((history.length = 1)) {
        navDestUrl(history[0].id, 0);
      } else {
        showError(
          "Missing venue or round information in URL.  Please try rescanning QR code or consult with your host.",
        );
      }
    }
    toggleLoading(false);
  } catch (error) {
    console.error("Failed to fetch form data:", error);
    showError("Unable to load form. Please refresh and try again.");
  }
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "alert-banner alert-banner--error";
  errorDiv.textContent = message;
  document.getElementById("main-content").prepend(errorDiv);
}

// Accessibility Helper
function setAriaLabel(elementId, label) {
  const element = document.getElementById(elementId);
  if (element) element.setAttribute("aria-label", label);
}

// DOM Creation Helper
function createSelectOption(value, label, customStyles = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  Object.entries(customStyles).forEach(([key, val]) => {
    option.style[key] = val;
  });
  return option;
}

// Search Filtering Logic
function filterVenues() {
  const input = document.getElementById("searchBox").value.toUpperCase();
  const select = document.getElementById("venue-list");
  const options = select.getElementsByTagName("option");

  for (let i = 0; i < options.length; i++) {
    const txtValue = options[i].textContent || options[i].innerText;
    options[i].style.display = txtValue.toUpperCase().includes(input)
      ? ""
      : "none";
  }
}

function handleVenueSelection(selectElement) {
  const selectedValue = selectElement.value;

  for (let i = 0; i < selectElement.options.length; i++) {
    selectElement.options[i].selected =
      selectElement.options[i].value === selectedValue;
  }

  console.log("Selected Venue ID:", selectedValue);
}

function joinGame() {
  const sel = document.getElementById("venue-list");
  if (sel.value) {
    window.top.location.href =
      window.location.pathname + "?venueId=" + encodeURIComponent(sel.value);
  } else {
    alert("Please select a location from the list!");
  }
}

function updateFontSize(className) {
  const SIZES = [
    "size-small",
    "size-normal",
    "size-large",
    "size-larger",
    "size-largest",
  ];

  // Use documentElement (the <html> tag) instead of body
  const root = document.documentElement;

  root.classList.remove(...SIZES);
  root.classList.add(className);

  CacheManager.set(STORAGE_KEYS.SYSTEM.FONT_SIZE, className);
}

window.updateFontSize = updateFontSize;

const toggleBtn = document.getElementById("theme-toggle");
toggleBtn.addEventListener("click", () => {
  setTheme();
});

// Add this to your initialization/load listener in form.js
function initTheme() {
  const savedTheme = CacheManager.get(STORAGE_KEYS.SYSTEM.THEME);
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;

  // Logic: Use saved preference IF it exists, otherwise fallback to system
  if (!savedTheme) {
    if (systemPrefersDark) {
      setTheme("theme-dark");
    } else {
      setTheme("theme-light");
    }
  } else {
    setTheme(savedTheme);
  }
}

function setTheme(theme) {
  console.log(`Requested Theme: ${theme}`);
  const newTheme =
    theme || (CacheManager.get(STORAGE_KEYS.SYSTEM.THEME) === "theme-dark"
      ? "theme-light"
      : "theme-dark");
  console.log(`New Theme: ${newTheme}`)
  const wantDark = newTheme === "theme-dark";
  console.log(`Want Dark Theme: ${wantDark}`);
  document.documentElement.classList.toggle("theme-dark", wantDark);
  const isDark = document.documentElement.classList.contains("theme-dark");
  toggleBtn.textContent = isDark ? "🌙 Dark Mode" : "☀️ Light Mode";
  CacheManager.set(
    STORAGE_KEYS.SYSTEM.THEME,
    isDark ? "theme-dark" : "theme-light",
  );
  console.log(`Theme = ${isDark ? "theme-dark" : "theme-light"}`);
}

// Ensure you run this on startup
window.addEventListener("load", initTheme);

// On page load, apply the saved preference
window.addEventListener("load", () => {
  toggleLoading(true, 60000);

  toggleVisibility(document.getElementById("container"), true);
  document.title = "Trivia Venue - Loading...";

  const savedSize = CacheManager.get(
    STORAGE_KEYS.SYSTEM.FONT_SIZE,
    "size-normal",
  );
  document.getElementById("fontSizeSelector").value = savedSize;
  document.body.classList.add(savedSize);
});

function toggleVisibility(el, show) {
  if (el) {
    if (show) {
      console.log("Show element:", el.id);
      if (el.classList.contains("hidden")) el.classList.remove("hidden");
    } else {
      console.log("Hide element:", el.id);
      if (!el.classList.contains("hidden")) el.classList.add("hidden");
    }
  }
}

/**
 * Toggles the loading screen
 * @param {boolean} show - true to show, false to hide
 * @param {number} duration - time in ms to keep visible (if showing)
 * @param {function} callback - optional function to run after hiding
 */
function toggleLoading(show, duration = 60000, callback = null) {
  const primaryColor = CacheManager.get(venueKeys.PRIMARY_COLOR);
  document.documentElement.style.setProperty(
    "--plt-color-primary",
    primaryColor,
  );
  const logoSrc = CacheManager.get(venueKeys.LOGOSRC) || defaultLogoSrc;
  const loadingLogo = document.getElementById("loading-logo");
  loadingLogo.alt = "Loading...";
  //if (!loadingLogo.src)
  loadingLogo.src = logoSrc;
  console.log("Loading Logo Source Set");

  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;

  if (show) {
    console.log("Show Loading");
    overlay.classList.remove("hide");
    overlay.classList.remove("hidden");
    console.log("Loading Logo Shown");

    // Auto-hide after specified duration
    setTimeout(() => {
      toggleLoading(false, 0, callback);
    }, duration);
  } else {
    console.log("Hide Loading");
    overlay.classList.add("hide");
    setTimeout(() => {
      overlay.classList.add("hidden");
      if (callback) callback();
    }, 500);
  }
}

function toggleSelectColor(selectElement) {
  if (selectElement.tagName === "SELECT") {
    if (selectElement.value === null || selectElement.value === "") {
      selectElement.classList.add("has-value");
    } else {
      selectElement.classList.remove("has-value");
    }
  }
}

function getDestUrl(venueId, roundNum) {
  const emailInput = document.getElementById("userEmail");
  const emailValue = emailInput ? emailInput.value : "";
  const emailStorage = CacheManager.get(STORAGE_KEYS.SYSTEM.EMAIL);
  const emailFinal = emailValue || emailStorage || "";

  if (!emailFinal) {
    console.warn("User email not found. Proceeding without email.");
  }

  const destUrl =
    window.location.pathname +
    "?venue=" +
    encodeURIComponent(venueId) +
    "&round=" +
    roundNum +
    "&email=" +
    encodeURIComponent(emailFinal);
  console.log("Navigating to:", destUrl);
  return destUrl;
}

function navDestUrl(venueId, roundNum) {
  toggleLoading(true, 60000);
  const destUrl = getDestUrl(venueId, roundNum);
  window.top.location.href = destUrl;
}

function handleNavClick(targetRound) {
  navDestUrl(vId, targetRound);
}

function updateDuplicateStates() {
  const form = document.getElementById("trivia-form");
  const selects = Array.from(form.querySelectorAll("select"));

  if (selects.length === 0) {
    console.warn("updateDuplicateStates: No <select> elements found in form.");
    return;
  }
  if (!selects[0].options) {
    console.warn("updateDuplicateStates: First select element has no options.");
    return;
  }

  // 1. Get all unique available options (excluding the "Select..." placeholder)
  // We assume the first option is the placeholder, so we take options from index 1 onwards
  const allAvailableOptions = Array.from(selects[0].options).filter(
    (o) => o.value !== "",
  );

  // 2. Only run the logic if there are more options than select boxes
  if (allAvailableOptions.length <= selects.length) {
    // Optional: Reset all styles if condition isn't met
    selects.forEach((s) => {
      s.style.backgroundColor = "transparent";
      Array.from(s.options).forEach((o) => {
        // o.style.color = "var(--plt-color-black-pure)";
        // o.style.backgroundColor = "";
        // o.textContent = o.dataset.label;
      });
    });
    return;
  }

  // 3. Count occurrences
  const valueCounts = {};
  selects.forEach((s) => {
    if (s.value !== "") {
      valueCounts[s.value] = (valueCounts[s.value] || 0) + 1;
    }
  });

  // 4. Apply styles
  selects.forEach((select) => {
    const isDuplicated = select.value !== "" && valueCounts[select.value] > 1;
    select.classList.toggle("isDuplicated", isDuplicated);

    Array.from(select.options).forEach((option) => {
      if (option.value === "") return;

      const isSelected =
        ((valueCounts[option.value] || 0) > 0 &&
          select.value !== option.value) ||
        ((valueCounts[option.value] || 0) > 1 && select.value === option.value);

      option.classList.toggle("isSelected", isSelected);
      option.textContent = isSelected
        ? `${option.dataset.label} (Already choosen)`
        : option.dataset.label;
    });
  });
}

function updateCompletedRoundPills() {
  const completed = CacheManager.get(venueKeys.COMPLETED_ROUNDS, []);
  const rList = getCleanRoundsArray();
  console.log("Available rounds:", rList);

  rList.forEach((rNum) => {
    console.log(
      "Checking round:",
      rNum,
      "Completed rounds in cache:",
      completed,
    );
    const dot = document.getElementById("dot-" + rNum);
    const pill = document.getElementById("pill-" + rNum);

    if (completed.includes(rNum.toString())) {
      console.log("Round", rNum, "is marked as completed in cache.");
      // Check if the user is currently ON this round
      if (rNum === currentRound) {
        //&& currentRound !== 0
        showCompletedWarning(rNum);

        const form = document.getElementById("trivia-form");
        // HIDE THE FORM
        console.log("Hiding form for completed round:", rNum);
        if (form) {
          toggleVisibility(form, false);
        }
      }

      if (dot) dot.classList.add("completed");
      if (pill) pill.classList.add("completed");
    } else if (rNum === currentRound) {
      if (dot) dot.classList.add("current");
    }
  });
}

function getCleanRoundsArray() {
  const raw = appData.availableRounds || [];
  if (Array.isArray(raw)) {
    return raw.sort((a, b) => a - b);
  }
  return raw
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
}

// Completed warning
function showCompletedWarning(roundNum) {
  const content = document.getElementById("main-content");

  // Create a unique container so we don't duplicate it
  const warningDiv = document.createElement("div");
  warningDiv.className = "alert-banner alert-banner--warning";

  warningDiv.innerHTML = `
          <strong>You have already submitted answers for Round ${roundNum}!</strong>
          <br/>
          If this is not correct please reset the round.
          <br/><br/>
          <button id="btnReset" class="alert-banner--button-reset">
            RESET ROUND
          </button>
          <dialog id="confirmDialog" class="alert-banner--dialog-confirm">
            <p>Are you sure you want to reset this round?<br/>All current answers will be cleared.</p>
            <div class="alert-banner--button-container">
              <button id="cancelBtn" class="alert-banner--button-cancel">Cancel</button>
              <button id="confirmBtn" class="alert-banner--button-confirm">Yes, Reset</button>
            </div>
          </dialog>
          <br/><br/>
          Or select the current round below.
        `;

  content.prepend(warningDiv);

  // Get elements
  const dialog = document.getElementById("confirmDialog");
  const confirmBtn = document.getElementById("confirmBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  // 1. When the "RESET ROUND" button is clicked, open the custom dialog
  document.getElementById("btnReset").addEventListener("click", () => {
    dialog.showModal(); // This makes it a proper modal dialog
  });

  // 2. Close if Cancel is clicked
  cancelBtn.addEventListener("click", () => {
    dialog.close();
  });

  // 3. Perform the reset if Confirm is clicked
  confirmBtn.addEventListener("click", () => {
    dialog.close();

    // 1. Remove from completed rounds
    let completed = CacheManager.get(venueKeys.COMPLETED_ROUNDS, []);
    completed = completed.filter((r) => r !== roundNum.toString());
    CacheManager.set(venueKeys.COMPLETED_ROUNDS, completed);

    // 2. Clear all TEMPORARY form data for THIS venue/round
    CacheManager.clear(roundKeyPrefix);

    navDestUrl(vId, roundNum);
  });
}

// PROGRESS BAR
function updateProgressBar() {
  const form = document.getElementById("trivia-form");
  if (!form) return;
  console.log("Updating progress bar...");

  // Select only visible inputs
  const inputs = Array.from(
    form.querySelectorAll('input[type="text"], input[type="email"], select'),
  ).filter((input) => {
    // input.id !== 'userEmail';

    // 1. Skip hidden inputs
    if (input.type === "hidden") return false;

    if (currentRound > 1) {
      // 2. Find the parent container
      const parentBlock = input.closest(".q-block");
      // 3. Find the label within that container and check its text
      const label = parentBlock ? parentBlock.querySelector("label") : null;
      const labelText = label ? label.textContent.toLowerCase() : "";
      // 4. Return true if this is a "continuous clue"
      const isContinuousClue = labelText.includes("continuous clue");
      //return !isContinuousClue;
    }

    return true;
  });

  if (inputs.length === 0) return;
  console.log(
    `Progress: Found ${inputs.length} visible inputs for progress calculation`,
  );

  const filledCount = inputs.filter(
    (input) => input.value.trim() !== "",
  ).length;
  const percentage = Math.round((filledCount / inputs.length) * 100);
  const text = filledCount + " / " + inputs.length + " answered";

  const pContainer = document.getElementById("form-progress");
  const pFill = document.getElementById("progress-bar__fill");
  const pText = document.getElementById("progress-bar__label");

  if (pContainer && pFill) {
    console.log(`Progress: ${percentage}% (${text})`);
    toggleVisibility(pContainer, true);
    pFill.style.width = percentage + "%";
    pText.textContent = text;
  }
}

function setDoubleRound(selectValue) {
  const match = selectValue.match(/(\d+)/);
  const roundNumber = match ? match[0] : null;

  if (roundNumber) {
    CacheManager.set(venueKeys.DOUBLE_ROUND, roundNumber);
    console.log("Bonus round saved:", roundNumber);
  }
}

function getDoubleRound() {
  return CacheManager.get(venueKeys.DOUBLE_ROUND);
}

(function () {
  const form = document.getElementById("trivia-form");
  const teamDisplay = document.getElementById("team-name-display");
  const badgeDoubleRound = document.getElementById("badge-double");

  // LOAD INITIAL GAME STATE
  window.addEventListener("load", () => {
    const regTime = parseInt(CacheManager.get(venueKeys.REGISTRATION_TIME), 10);
    console.log("Reg Time:", regTime);

    if (currentRound === 0) {
      const now = new Date().getTime();
      const sixHoursInMs = CONFIG.CACHE_EXPIRY_MS;

      if (now - regTime > sixHoursInMs) {
        console.log("Session expired. Clearing storage...");
        CacheManager.remove(venueKeys.DOUBLE_ROUND);
        CacheManager.remove(venueKeys.COMPLETED_ROUNDS);
      }

      if (teamDisplay) toggleVisibility(teamDisplay, false);
      if (badgeDoubleRound) toggleVisibility(badgeDoubleRound, false);
    }

    const savedTeam = CacheManager.get(venueKeys.TEAM_NAME);
    if (savedTeam) {
      console.log("Saved team name found:", savedTeam);
      teamDisplay.textContent = "Team: " + savedTeam;
      toggleVisibility(teamDisplay, true);
    }

    if (badgeDoubleRound) {
      const doubleRound = getDoubleRound();
      console.log("Double Round:", doubleRound);
      const isDouble =
        currentRound === 5 || currentRound === parseInt(doubleRound);
      if (isDouble) {
        toggleVisibility(badgeDoubleRound, true);
      } else {
        toggleVisibility(badgeDoubleRound, false);
      }
    }
  });

  console.log("Setting up form listeners...");
  if (!form) return;
  console.log("Form found:", form.id);

  form.addEventListener("input", (e) => {
    if (e.target.name && e.target.id === "userEmail") {
      CacheManager.set(STORAGE_KEYS.SYSTEM.EMAIL, e.target.value);
    }

    if (e.target.name && e.target.id !== "userEmail") {
      const key = roundKeyPrefix + e.target.name;
      CacheManager.set(key, e.target.value);
    }

    if (e.target.tagName === "SELECT") {
      toggleSelectColor(e.target);
      updateDuplicateStates();
    }

    updateProgressBar();
  });

  // Submission Logic

  document
    .getElementById("cancel-submit-button")
    .addEventListener("click", () => {
      document.getElementById("submit-confirm-dialog").close();
    });

  document
    .getElementById("confirm-submit-button")
    .addEventListener("click", () => {
      document.getElementById("submit-confirm-dialog").close();
      proceedWithSubmission();
    });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const elementsToCheck = Array.from(form.querySelectorAll("input, select"));

    // Now filter them
    const emptyFields = elementsToCheck.filter((el) => {
      // 1. Only check fields that have the "required" attribute
      //if (!el.hasAttribute('required')) return false;

      // 2. Identify if this input is a "continuous clue" field
      const parentBlock = el.closest(".q-block");
      const label = parentBlock ? parentBlock.querySelector("label") : null;
      const isContinuousClue =
        label && label.textContent.toLowerCase().includes("continuous clue");

      // 3. IGNORE logic:
      // If we are past round 1 AND this is a "continuous clue", return false (don't check it)
      if (currentRound > 1 && isContinuousClue) {
        return false;
      }

      // 2. Check if the value is empty
      return el.value.trim() === "";
    });

    if (emptyFields.length > 0) {
      document.getElementById("submit-confirm-dialog").showModal();
    } else {
      proceedWithSubmission();
    }
  });

  // Helper: The logic that actually fires the request
  function proceedWithSubmission() {
    console.log("Submitting...");
    toggleLoading(true, 60000);

    const submitButton = document.getElementById("submit-answers-button");
    submitButton.textContent = "SUBMITTING...";
    submitButton.disabled = true;

    window.scrollTo({ top: 0, behavior: "smooth" });

    const formData = new FormData(form);
    // ROUND 0 only
    if (currentRound === 0) {
      form.querySelectorAll(".q-block").forEach((block) => {
        const label = block.querySelector("label");
        if (
          label &&
          label.textContent.toUpperCase().includes(HEADER_TEAM_NAME)
        ) {
          const teamVal = block.querySelector("input").value;
          CacheManager.set(venueKeys.TEAM_NAME, teamVal);
        }
        if (
          label &&
          label.textContent.toUpperCase().includes(HEADER_DOUBLE_ROUND)
        ) {
          const selectElement = block.querySelector("select");
          if (selectElement && selectElement.value) {
            setDoubleRound(selectElement.value);
          }
        }
      });
      CacheManager.set(
        venueKeys.REGISTRATION_TIME,
        new Date().getTime().toString(),
      );
    }

    const summaryHtml = buildSummaryTable(form);

    const finalizeSubmission = () => {
      console.log("Finalizing submission...");
      markRoundComplete(currentRound);
      if (currentRound === 0) {
        CacheManager.clear(`plt_round_${vId}_`);
      } else {
        CacheManager.clear(roundKeyPrefix);
      }

      if (currentRound === 0) {
        handleRedirect();
      } else {
        showRoundSummary(summaryHtml);
      }
    };

    // 1. Get the entries from FormData
    const entries = Array.from(formData.entries());
    // 2. Map the entries to pull only the value (index 1 of the [key, value] pair)
    const valuesOnlyArray = entries.map((entry) => entry[1]);
    // 3. Add to your payload
    const payload = {
      action: "submit",
      timestamp: new Date().toISOString(),
      ssheetid: appData.venueSsheetId,
      venueid: vId,
      roundid: currentRound,
      formdata: valuesOnlyArray, // This will be ["Item1", "Item2", "Item3", "Item4"]
    };

    // Use a simple for...of loop on the entries
    // This is more compatible than formData.forEach
    try {
      for (let [key, value] of formData.entries()) {
        payload[key] = value;
      }
    } catch (e) {
      // Fallback for very restrictive environments
      console.error("FormData iteration failed, using manual field mapping.");
      // Manual fallback: iterate over your known form inputs
      const inputs = form.querySelectorAll("input, select, textarea");
      inputs.forEach((input) => {
        if (input.name) payload[input.name] = input.value;
      });
    }

    console.log("Form data prepared, sending to server...");
    console.log("Form Data:", Object.fromEntries(formData.entries()));
    console.log("Payload:", payload);
    fetch(CONFIG.API_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(() => {
        finalizeSubmission();
      })
      .catch((err) => {
        console.log("Fetch handled via fallback:", err);
        showError(
          "Submission failed. Please check your connection and try again.",
        );
        submitButton.textContent = "SUBMIT ANSWERS";
        submitButton.disabled = false;
      })
      .finally(() => {
        toggleLoading(false);
      });

    try {
      if (currentRound === 0) {
        insertRegistrationSubmission(payload);
      } else {
        insertScoringRoundSubmission(payload);
      }
      //finalizeSubmission();
    } catch (err) {
      console.error(err);
      showError("Submission failed.");
    }

    console.log("Submitted");
  }

  function markRoundComplete(roundId) {
    console.log("Round Complete:", roundId);
    let completed = CacheManager.get(venueKeys.COMPLETED_ROUNDS, []);
    console.log("Previously completed rounds:", completed);
    const rString = roundId.toString();
    console.log("Marking round as complete:", rString);
    if (!completed.includes(rString)) {
      completed.push(rString);
      CacheManager.set(venueKeys.COMPLETED_ROUNDS, completed);
    }
  }

  function showRoundSummary(html) {
    //toggleLoading(true, 1000);
    console.log("Show Round Summary");
    toggleVisibility(form, false);

    // Hide progress indicator when viewing the summary table
    const pContainer = document.getElementById("form-progress");
    if (pContainer) toggleVisibility(pContainer, false);

    const stickyTitle = document.getElementById("round-title");
    if (stickyTitle) {
      stickyTitle.textContent =
        currentRound === 0
          ? "Registration Summary"
          : `Your Submitted Round #${currentRound} Answers`;
    }

    const desc = document.getElementById("round-description");
    if (desc) toggleVisibility(desc, false);

    document.getElementById("summary-panel").innerHTML = html;

    const availableRounds = getCleanRoundsArray();
    const finalRound =
      availableRounds.length > 0 ? Math.max(...availableRounds) : null;
    const btnContinue = document.getElementById("btnContinue");

    if (btnContinue && currentRound === finalRound) {
      btnContinue.textContent = "CONTINUE";
    }

    const roundSummary = document.getElementById("round-summary");
    if (roundSummary) toggleVisibility(roundSummary, true);
  }

  function buildSummaryTable(formElement) {
    const table = document.createElement("table");
    table.classList.add("summary-table");

    formElement.querySelectorAll(".q-block").forEach((block, index, array) => {
      const label = block
        .querySelector("label")
        .textContent.replace(/\*/g, "")
        .trim();
      const input = block.querySelector("input, select");

      if (input && input.type !== "hidden") {
        const row = table.insertRow();

        const labelCell = row.insertCell();
        labelCell.textContent = label;

        const valueCell = row.insertCell();
        valueCell.textContent = input.value;
      }
    });

    return table.outerHTML;
  }

  document
    .getElementById("btnContinue")
    .addEventListener("click", handleRedirect);

  function handleRedirect() {
    console.log("Navigating to next round...");

    const availableRounds = getCleanRoundsArray();
    let nextRound = availableRounds.find((r) => r > currentRound);

    if (currentRound === 0 && (nextRound === undefined || nextRound === null)) {
      const numericRounds = availableRounds.filter((r) => r > 0);
      if (numericRounds.length > 0) nextRound = numericRounds[0];
    }

    const finalRound =
      availableRounds.length > 0 ? Math.max(...availableRounds) : null;

    if (nextRound !== undefined && nextRound !== null && !isNaN(nextRound)) {
      if (nextRound === 0) {
        CacheManager.clear(`plt_venue_${vId}_`);
      }
      navDestUrl(vId, nextRound);
    } else {
      // Final/invalid Round Detected
      if (currentRound === finalRound) {
        CacheManager.remove(venueKeys.DOUBLE_ROUND);
        CacheManager.remove(venueKeys.COMPLETED_ROUNDS);
      }
      const confirmationText =
        appData.confirmationText || "Your responses have been submitted!";
      showSuccessScreen(confirmationText);
    }

    console.log("Navigated");
  }

  function showSuccessScreen(message) {
    console.log("Showing success screen...");
    const displayArea = document.getElementById("confirmation-text");
    if (displayArea) {
      displayArea.innerHTML = message || "Your responses have been submitted!";
    }
    const overlay = document.getElementById("success-overlay");
    if (overlay) {
      toggleVisibility(overlay, true);
    }
    console.log("Success screen displayed");
  }
})();
