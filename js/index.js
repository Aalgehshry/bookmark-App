/**
 * Bookmark App
 * -------------------------------------------------------------
 * Saves the user's favorite sites in localStorage and renders
 * them in a searchable table.
 *
 * The whole script lives inside one IIFE so nothing leaks into
 * the global scope.
 */
(function () {
  "use strict";

  /* =============================================================
     Constants
     ============================================================= */

  const STORAGE_KEY = "bookmarksList";
  const THEME_KEY = "bookmarksTheme";
  const TOAST_DURATION = 4000;
  const PROTOCOL_REGEX = /^https?:\/\//i;
  const NAME_REGEX = /^\w{3,}(\s+\w+)*$/;
  const URL_REGEX = /^(https?:\/\/)?(w{3}\.)?\w+\.\w{2,}\/?(:\d{2,5})?(\/\w+)*$/;

  /* =============================================================
     DOM references
     ============================================================= */

  const form = document.getElementById("bookmarkForm");
  const siteName = document.getElementById("bookmarkName");
  const siteURL = document.getElementById("bookmarkURL");
  const searchInput = document.getElementById("searchInput");
  const tableContent = document.getElementById("tableContent");
  const bookmarkCount = document.getElementById("bookmarkCount");
  const emptyState = document.getElementById("emptyState");
  const emptyTitle = document.getElementById("emptyTitle");
  const emptyHint = document.getElementById("emptyHint");
  const toastStack = document.getElementById("toastStack");
  const themeToggle = document.getElementById("themeToggle");

  const rulesModal = document.getElementById("boxInfo");
  const closeBtn = document.getElementById("closeBtn");

  const confirmModal = document.getElementById("confirmBox");
  const confirmName = document.getElementById("confirmName");
  const confirmCloseBtn = document.getElementById("confirmCloseBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  /* =============================================================
     State
     ============================================================= */

  /** @type {{siteName: string, siteURL: string}[]} */
  let bookmarks = readStorage();

  /** Index queued for deletion while the confirm dialog is open. */
  let pendingDeleteIndex = null;

  /** Element that had focus before a dialog opened, to restore it after. */
  let lastFocusedElement = null;

  /* =============================================================
     Storage
     ============================================================= */

  /**
   * Reads the saved bookmarks. Returns an empty list when storage is
   * unavailable (private mode) or holds anything other than an array.
   * @returns {{siteName: string, siteURL: string}[]}
   */
  function readStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(stored)) return [];
      return stored.filter(function (item) {
        return item && typeof item.siteName === "string" && typeof item.siteURL === "string";
      });
    } catch (error) {
      return [];
    }
  }

  /** Persists the current list, warning the user if the write fails. */
  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (error) {
      showToast("Could not save your bookmarks on this device.", "error");
    }
  }

  /* =============================================================
     Helpers
     ============================================================= */

  /** Escapes text before it goes into innerHTML. */
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  /** Uppercases the first character, leaving an empty string untouched. */
  function capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /** Adds https:// when the user typed a bare domain. */
  function toAbsoluteURL(url) {
    return PROTOCOL_REGEX.test(url) ? url : "https://" + url;
  }

  /** Strips the protocol so the table shows a shorter, cleaner URL. */
  function toDisplayURL(url) {
    return url.replace(PROTOCOL_REGEX, "").replace(/\/$/, "");
  }

  /** First letter of the site name, used for the avatar tile. */
  function initialOf(name) {
    return (name.trim().charAt(0) || "?").toUpperCase();
  }

  /* =============================================================
     Rendering
     ============================================================= */

  /** Rebuilds the table from `bookmarks`, honouring the search box. */
  function render() {
    const query = searchInput.value.trim().toLowerCase();

    // Keep the real index so Visit/Delete still target the right row
    // while the list is filtered.
    const visible = bookmarks
      .map(function (bookmark, index) {
        return { bookmark: bookmark, index: index };
      })
      .filter(function (entry) {
        if (!query) return true;
        return (
          entry.bookmark.siteName.toLowerCase().includes(query) ||
          entry.bookmark.siteURL.toLowerCase().includes(query)
        );
      });

    tableContent.innerHTML = visible.map(rowTemplate).join("");

    bookmarkCount.textContent = String(bookmarks.length);
    updateEmptyState(visible.length, query);
  }

  /** Builds the markup for a single row. */
  function rowTemplate(entry) {
    const name = escapeHTML(entry.bookmark.siteName);
    const displayURL = escapeHTML(toDisplayURL(entry.bookmark.siteURL));
    const initial = escapeHTML(initialOf(entry.bookmark.siteName));

    return `
      <tr class="bookmark-row">
        <td class="row-index">${entry.index + 1}</td>
        <td>
          <div class="site-cell d-flex align-items-center justify-content-center gap-2">
            <span class="site-avatar" aria-hidden="true">${initial}</span>
            <span class="site-text text-start">
              <span class="site-name d-block" title="${name}">${name}</span>
              <span class="site-url d-block" title="${displayURL}">${displayURL}</span>
            </span>
          </div>
        </td>
        <td>
          <button type="button" class="btn btn-visit" data-action="visit" data-index="${entry.index}">
            <i class="fa-solid fa-eye pe-2" aria-hidden="true"></i>Visit
            <span class="visually-hidden">${name}</span>
          </button>
        </td>
        <td>
          <button type="button" class="btn btn-delete pe-2" data-action="delete" data-index="${entry.index}">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            Delete
            <span class="visually-hidden">${name}</span>
          </button>
        </td>
      </tr>`;
  }

  /** Shows the "nothing here" panel, with wording that fits the reason. */
  function updateEmptyState(visibleCount, query) {
    const isEmpty = visibleCount === 0;
    emptyState.classList.toggle("d-none", !isEmpty);

    if (!isEmpty) return;

    if (query) {
      emptyTitle.textContent = "No matching bookmarks";
      emptyHint.textContent = `Nothing matches "${query}". Try another search.`;
    } else {
      emptyTitle.textContent = "No bookmarks yet";
      emptyHint.textContent = "Add your first site using the form above.";
    }
  }

  /* =============================================================
     Toasts
     ============================================================= */

  /**
   * Shows a short message at the bottom of the screen.
   * @param {string} message
   * @param {"success"|"error"|"info"} [type]
   * @param {{label: string, onClick: Function}} [action] optional inline button
   */
  function showToast(message, type, action) {
    const toast = document.createElement("div");
    toast.className = "toast-item toast-" + (type || "info");

    const text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message;
    toast.appendChild(text);

    let timeoutId;

    const dismiss = function () {
      clearTimeout(timeoutId);
      toast.classList.add("toast-out");
      toast.addEventListener("animationend", function () {
        toast.remove();
      });
    };

    if (action) {
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "toast-action";
      actionBtn.textContent = action.label;
      actionBtn.addEventListener("click", function () {
        action.onClick();
        dismiss();
      });
      toast.appendChild(actionBtn);
    }

    toastStack.appendChild(toast);
    timeoutId = setTimeout(dismiss, TOAST_DURATION);
  }

  /* =============================================================
     Dialogs
     ============================================================= */

  /** Opens a dialog and moves focus into it. */
  function openModal(modal) {
    lastFocusedElement = document.activeElement;
    modal.classList.remove("d-none");
    modal.setAttribute("aria-hidden", "false");

    const focusable = modal.querySelector("button");
    if (focusable) focusable.focus();
  }

  /** Closes a dialog and returns focus where it came from. */
  function closeModal(modal) {
    modal.classList.add("d-none");
    modal.setAttribute("aria-hidden", "true");

    if (modal === confirmModal) pendingDeleteIndex = null;

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  /** Closes whichever dialog is currently open. */
  function closeOpenModal() {
    [rulesModal, confirmModal].forEach(function (modal) {
      if (!modal.classList.contains("d-none")) closeModal(modal);
    });
  }

  /* =============================================================
     Validation
     ============================================================= */

  /**
   * Applies Bootstrap's valid/invalid classes to a field.
   * An untouched, empty field stays neutral.
   * @returns {boolean} whether the value passes
   */
  function validate(element, regex) {
    const value = element.value.trim();
    const isValid = regex.test(value);

    if (!value) {
      element.classList.remove("is-valid", "is-invalid");
      return false;
    }

    element.classList.toggle("is-valid", isValid);
    element.classList.toggle("is-invalid", !isValid);
    return isValid;
  }

  /** Clears both inputs and their validation state. */
  function clearInput() {
    form.reset();
    [siteName, siteURL].forEach(function (element) {
      element.classList.remove("is-valid", "is-invalid");
    });
  }

  /* =============================================================
     Actions
     ============================================================= */

  /** Validates the form and stores a new bookmark. */
  function addBookmark() {
    const nameIsValid = validate(siteName, NAME_REGEX);
    const urlIsValid = validate(siteURL, URL_REGEX);

    if (!nameIsValid || !urlIsValid) {
      openModal(rulesModal);
      (nameIsValid ? siteURL : siteName).focus();
      return;
    }

    const url = siteURL.value.trim();
    const alreadySaved = bookmarks.some(function (bookmark) {
      return toDisplayURL(bookmark.siteURL).toLowerCase() === toDisplayURL(url).toLowerCase();
    });

    if (alreadySaved) {
      showToast("That site is already in your bookmarks.", "info");
      return;
    }

    bookmarks.push({
      siteName: capitalize(siteName.value.trim()),
      siteURL: url,
    });

    saveStorage();
    searchInput.value = "";
    render();
    clearInput();
    siteName.focus();
    showToast("Bookmark added.", "success");
  }

  /** Removes the queued bookmark and offers an undo. */
  function deleteBookmark(index) {
    const removed = bookmarks.splice(index, 1)[0];
    if (!removed) return;

    saveStorage();
    render();

    showToast(`"${removed.siteName}" deleted.`, "success", {
      label: "Undo",
      onClick: function () {
        bookmarks.splice(index, 0, removed);
        saveStorage();
        render();
      },
    });
  }

  /** Opens the site in a new tab. */
  function visitWebsite(index) {
    const bookmark = bookmarks[index];
    if (!bookmark) return;
    window.open(toAbsoluteURL(bookmark.siteURL), "_blank", "noopener,noreferrer");
  }

  /* =============================================================
     Theme
     ============================================================= */

  /** Applies a theme and syncs the toggle button's icon and label. */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);

    const goingDark = theme === "light";
    themeToggle.innerHTML = `<i class="fa-solid fa-${goingDark ? "moon" : "sun"}" aria-hidden="true"></i>`;
    themeToggle.setAttribute(
      "aria-label",
      `Switch to ${goingDark ? "dark" : "light"} theme`
    );
  }

  /** Restores the saved theme, falling back to the OS preference. */
  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (error) {
      /* storage unavailable — fall back below */
    }

    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  /* =============================================================
     Events
     ============================================================= */

  // Covers both clicking Submit and pressing Enter in a field.
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    addBookmark();
  });

  siteName.addEventListener("input", function () {
    validate(siteName, NAME_REGEX);
  });

  siteURL.addEventListener("input", function () {
    validate(siteURL, URL_REGEX);
  });

  searchInput.addEventListener("input", render);

  // One delegated listener for the whole table, so rows can be
  // re-rendered freely without stacking up handlers.
  tableContent.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    if (Number.isNaN(index)) return;

    if (button.dataset.action === "visit") {
      visitWebsite(index);
      return;
    }

    if (button.dataset.action === "delete") {
      pendingDeleteIndex = index;
      confirmName.textContent = bookmarks[index] ? bookmarks[index].siteName : "this site";
      openModal(confirmModal);
    }
  });

  confirmDeleteBtn.addEventListener("click", function () {
    const index = pendingDeleteIndex;
    closeModal(confirmModal);
    if (index !== null) deleteBookmark(index);
  });

  closeBtn.addEventListener("click", function () {
    closeModal(rulesModal);
  });

  [confirmCloseBtn, cancelDeleteBtn].forEach(function (button) {
    button.addEventListener("click", function () {
      closeModal(confirmModal);
    });
  });

  themeToggle.addEventListener("click", function () {
    const next =
      document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      /* theme just won't persist */
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeOpenModal();
  });

  // Click on the dimmed backdrop (not the dialog itself) closes it.
  document.addEventListener("click", function (event) {
    if (event.target.classList.contains("box-info")) {
      closeModal(event.target);
    }
  });

  /* =============================================================
     Start
     ============================================================= */

  initTheme();
  render();
})();
