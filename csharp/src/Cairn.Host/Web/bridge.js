// Cairn desktop bridge: defines window.memoryStack - the same API electron/preload.ts exposes through
// Electron's contextBridge - on top of the native window's message channel. Injected into index.html by the
// host before the renderer's own scripts run.
(function () {
  "use strict";
  if (window.memoryStack) return;

  var DATE_KEY = "__cairnDate";
  var BIN_KEY = "__bin";

  // Request/response methods: API name -> IPC channel (kept in step with electron/preload.ts).
  var INVOKE = {
    pickNotesFolder: "notesFolder:pick",
    loadNotesFolder: "notesFolder:load",
    reloadNotesFolder: "notesFolder:reload",
    listNotesFolders: "notesFolders:list",
    addNotesFolder: "notesFolders:add",
    createNotesFolder: "notesFolders:create",
    removeNotesFolder: "notesFolders:remove",
    renameNotesFolder: "notesFolders:rename",
    listCliAccess: "cliAccess:list",
    setCliAccess: "cliAccess:set",
    readNote: "notesFolder:readNote",
    readRaw: "notesFolder:readRaw",
    saveNote: "notesFolder:saveNote",
    createNote: "notesFolder:createNote",
    createFolder: "notesFolder:createFolder",
    renameFolder: "notesFolder:renameFolder",
    moveNote: "notesFolder:moveNote",
    seedStarterContent: "notesFolder:seedStarterContent",
    listFileTemplates: "templates:list",
    convertToTemplate: "templates:convert",
    createNoteFromTemplate: "templates:createNote",
    deleteNote: "notesFolder:deleteNote",
    getNoteHistory: "notesFolder:getNoteHistory",
    readNoteHistoryVersion: "notesFolder:readNoteHistoryVersion",
    restoreNoteVersion: "notesFolder:restoreNoteVersion",
    saveAttachment: "attachments:save",
    findOrphanedAttachments: "attachments:findOrphaned",
    deleteOrphanedAttachments: "attachments:deleteOrphaned",
    readAttachmentsAsDataUrls: "attachments:readManyAsDataUrls",
    saveExportedTextFile: "export:saveTextFile",
    saveExportedPdf: "export:savePdf",
    transcribeAudio: "voice:transcribe",
    renameNote: "notesFolder:renameNote",
    openExternal: "shell:openExternal",
    showItemInFolder: "shell:showItemInFolder",
    readNoteBody: "notesFolder:readNoteBody",
    readNoteProperties: "notesFolder:readNoteProperties",
    saveNoteProperties: "notesFolder:saveNoteProperties",
    readPropertySchema: "notesFolder:readPropertySchema",
    savePropertySchema: "notesFolder:savePropertySchema",
    readWorkspaceState: "notesFolder:readWorkspaceState",
    saveWorkspaceState: "notesFolder:saveWorkspaceState",
    readLayoutPrefs: "layout:read",
    saveLayoutPrefs: "layout:save",
    readAppSettings: "settings:read",
    saveAppSettings: "settings:save",
    setTitleBarOverlay: "window:setTitleBarOverlay",
    showSystemMenu: "window:showSystemMenu",
    openOrCreateDailyNote: "notesFolder:openOrCreateDailyNote",
    createTask: "tasks:create",
    listPlugins: "plugin:list",
    listAllPlugins: "plugin:listAll",
    setPluginEnabled: "plugin:setEnabled",
    getPluginPermissions: "plugin:getPermissions",
    revokePluginPermission: "plugin:revokePermission",
    pluginNotesRead: "plugin:notes:read",
    pluginNotesWrite: "plugin:notes:write",
    pluginRequestPermission: "plugin:requestPermission",
    pluginInvoke: "plugin:invoke",
    pluginOpenExternal: "plugin:openExternal",
    startSearch: "search:start",
    cancelSearch: "search:cancel",
    replaceAll: "search:replaceAll",
  };

  // Push events from the host: API name -> event channel. Each returns an unsubscribe function.
  var EVENTS = {
    onReconciled: "notesFolder:reconciled",
    onReconcileStatus: "notesFolder:reconcile-status",
    onFileChanged: "notesFolder:file-changed",
    onSearchResult: "search:result",
    onSearchDone: "search:done",
  };

  function toBase64(bytes) {
    var chunk = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // JSON.stringify calls toJSON (Date -> string) before a replacer sees the value, so the replacer reads the
  // original through `this`: Dates and binary buffers survive the trip as tagged objects.
  function replacer(key, value) {
    var raw = this[key];
    if (raw instanceof Date) {
      var tagged = {};
      tagged[DATE_KEY] = isNaN(raw.getTime()) ? null : raw.toISOString();
      return tagged;
    }
    if (raw instanceof ArrayBuffer) {
      var b = {};
      b[BIN_KEY] = toBase64(new Uint8Array(raw));
      b.type = "ArrayBuffer";
      return b;
    }
    if (ArrayBuffer.isView(raw)) {
      var v = {};
      v[BIN_KEY] = toBase64(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
      v.type = raw.constructor.name;
      return v;
    }
    return value;
  }

  // Structured clone keeps a Date a Date over Electron's IPC; do the same for tagged dates coming back.
  function reviver(key, value) {
    if (value && typeof value === "object" && typeof value[DATE_KEY] === "string" && Object.keys(value).length === 1) {
      return new Date(value[DATE_KEY]);
    }
    return value;
  }

  var pending = {};
  var nextId = 1;
  var listeners = {};

  function send(message) {
    window.external.sendMessage(JSON.stringify(message, replacer));
  }

  function invoke(channel, args) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject, channel: channel };
      try {
        send({ id: id, channel: channel, args: args });
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  window.external.receiveMessage(function (raw) {
    var msg;
    try {
      msg = JSON.parse(raw, reviver);
    } catch (e) {
      return;
    }
    if (msg.event) {
      var set = listeners[msg.event];
      if (set) set.slice().forEach(function (cb) { cb(msg.payload); });
      return;
    }
    var entry = pending[msg.id];
    if (!entry) return;
    delete pending[msg.id];
    if (msg.ok) entry.resolve(msg.result === undefined ? undefined : msg.result);
    else entry.reject(new Error("Error invoking remote method '" + entry.channel + "': Error: " + msg.error));
  });

  var api = {};
  Object.keys(INVOKE).forEach(function (name) {
    var channel = INVOKE[name];
    api[name] = function () {
      return invoke(channel, Array.prototype.slice.call(arguments));
    };
  });
  Object.keys(EVENTS).forEach(function (name) {
    var channel = EVENTS[name];
    api[name] = function (cb) {
      (listeners[channel] = listeners[channel] || []).push(cb);
      return function () {
        listeners[channel] = (listeners[channel] || []).filter(function (l) { return l !== cb; });
      };
    };
  });

    var HOST = window.__cairnHost || {};

  function hostWindow(action) {
    return invoke("host:window", [action]);
  }

  // Window chrome. Electron's hidden title bar leaves the page's own strip draggable and lets the OS paint the
  // minimize/maximize/close buttons over it (titleBarOverlay). Without a native frame the page has to do both:
  // start window drags from `-webkit-app-region: drag` areas, resize from the edges, and draw the buttons.
  function setupChromeless() {
    var maximized = false;
    var overlay = { color: "#1e1f24", symbolColor: "#e6e6e6" };

    function setMaximized(value) {
      maximized = !!value;
      var btn = document.querySelector(".cairn-wc .max");
      if (btn) {
        btn.innerHTML = maximized ? ICONS.restore : ICONS.maximize;
        btn.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
      }
      document.documentElement.toggleAttribute("data-cairn-maximized", maximized);
    }

    function applyOverlay(colors) {
      if (!colors) return;
      if (typeof colors.color === "string") overlay.color = colors.color;
      if (typeof colors.symbolColor === "string") overlay.symbolColor = colors.symbolColor;
      var root = document.documentElement.style;
      root.setProperty("--cairn-wc-bg", overlay.color);
      root.setProperty("--cairn-wc-fg", overlay.symbolColor);
    }

    var ICONS = {
      minimize: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" fill="none"/></svg>',
      maximize: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none"/></svg>',
      restore: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5v-2h7v7h-2M0.5 2.5h7v7h-7z" stroke="currentColor" fill="none"/></svg>',
      close: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" fill="none"/></svg>',
    };

    function appRegionOf(el) {
      for (; el && el.nodeType === 1; el = el.parentElement) {
        var region = getComputedStyle(el).getPropertyValue("-webkit-app-region");
        if (region === "drag" || region === "no-drag") return region;
      }
      return "none";
    }

    function install() {
      var style = document.createElement("style");
      style.setAttribute("data-cairn-host", "window-chrome");
      style.textContent =
        ".cairn-wc{position:fixed;top:0;right:0;height:32px;display:flex;z-index:2147483646;-webkit-app-region:no-drag;user-select:none;background:var(--cairn-wc-bg)}" +
        ".cairn-wc button{width:46px;height:32px;border:0;margin:0;padding:0;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--cairn-wc-fg);cursor:default}" +
        ".cairn-wc button:hover{background:rgba(127,127,127,.25)}" +
        ".cairn-wc button.close:hover{background:#e81123;color:#fff}" +
        ".cairn-edge{position:fixed;z-index:2147483645;-webkit-app-region:no-drag}" +
        "html[data-cairn-maximized] .cairn-edge{display:none}" +
        ".cairn-menu{position:fixed;z-index:2147483647;min-width:160px;padding:4px 0;border-radius:6px;background:var(--bg-surface,#2a2c38);color:var(--text-primary,#e6e6e6);border:1px solid var(--border-control,#4a4c63);box-shadow:0 6px 20px var(--shadow-menu,rgba(0,0,0,.4));font:13px system-ui,sans-serif}" +
        ".cairn-menu div{padding:5px 16px;cursor:default}" +
        ".cairn-menu div:hover:not([data-disabled]){background:var(--bg-control-hover,#454868)}" +
        ".cairn-menu div[data-disabled]{opacity:.4}" +
        ".cairn-menu hr{border:0;border-top:1px solid var(--border-divider,#33343d);margin:4px 0}";
      document.head.appendChild(style);

      var controls = document.createElement("div");
      controls.className = "cairn-wc";
      controls.innerHTML =
        '<button class="min" aria-label="Minimize">' + ICONS.minimize + "</button>" +
        '<button class="max" aria-label="Maximize">' + ICONS.maximize + "</button>" +
        '<button class="close" aria-label="Close">' + ICONS.close + "</button>";
      controls.querySelector(".min").addEventListener("click", function () { hostWindow("minimize"); });
      controls.querySelector(".max").addEventListener("click", function () { hostWindow("toggleMaximize"); });
      controls.querySelector(".close").addEventListener("click", function () { hostWindow("close"); });
      document.body.appendChild(controls);

      // Invisible grips along the window border (the frame that normally provides resizing is gone).
      var T = 5, C = 10;
      [
        ["Top", "top:0;left:" + C + "px;right:" + C + "px;height:" + T + "px;cursor:ns-resize"],
        ["Bottom", "bottom:0;left:" + C + "px;right:" + C + "px;height:" + T + "px;cursor:ns-resize"],
        ["Left", "left:0;top:" + C + "px;bottom:" + C + "px;width:" + T + "px;cursor:ew-resize"],
        ["Right", "right:0;top:" + C + "px;bottom:" + C + "px;width:" + T + "px;cursor:ew-resize"],
        ["TopLeft", "top:0;left:0;width:" + C + "px;height:" + C + "px;cursor:nwse-resize"],
        ["TopRight", "top:0;right:0;width:" + C + "px;height:" + C + "px;cursor:nesw-resize"],
        ["BottomLeft", "bottom:0;left:0;width:" + C + "px;height:" + C + "px;cursor:nesw-resize"],
        ["BottomRight", "bottom:0;right:0;width:" + C + "px;height:" + C + "px;cursor:nwse-resize"],
      ].forEach(function (edge) {
        var grip = document.createElement("div");
        grip.className = "cairn-edge";
        grip.style.cssText = edge[1];
        grip.addEventListener("mousedown", function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          hostWindow("resize:" + edge[0]);
        });
        document.body.appendChild(grip);
      });

      applyOverlay(overlay);
      hostWindow("state").then(setMaximized);
    }

    document.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || appRegionOf(e.target) !== "drag") return;
      e.preventDefault();
      hostWindow("drag");
    }, true);

    document.addEventListener("dblclick", function (e) {
      if (e.button === 0 && appRegionOf(e.target) === "drag") hostWindow("toggleMaximize");
    }, true);

    // The look-alike system menu behind the app icon (Electron could only pop up a native menu with no API
    // for the OS's own, so the renderer already treats this as an approximation).
    function showSystemMenu(x, y) {
      var existing = document.querySelector(".cairn-menu");
      if (existing) existing.remove();
      var menu = document.createElement("div");
      menu.className = "cairn-menu";
      menu.style.left = Math.round(x) + "px";
      menu.style.top = Math.round(y) + "px";
      function item(label, action, disabled) {
        var row = document.createElement("div");
        row.textContent = label;
        if (disabled) row.setAttribute("data-disabled", "");
        else row.addEventListener("click", function () { close(); hostWindow(action); });
        menu.appendChild(row);
      }
      item("Restore", "toggleMaximize", !maximized);
      item("Minimize", "minimize", false);
      item("Maximize", "toggleMaximize", maximized);
      menu.appendChild(document.createElement("hr"));
      item("Close", "close", false);
      function close() {
        menu.remove();
        document.removeEventListener("mousedown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
      }
      function onOutside(e) { if (!menu.contains(e.target)) close(); }
      function onKey(e) { if (e.key === "Escape") close(); }
      document.body.appendChild(menu);
      document.addEventListener("mousedown", onOutside, true);
      document.addEventListener("keydown", onKey, true);
      return Promise.resolve(true);
    }

    api.setTitleBarOverlay = function (colors) {
      applyOverlay(colors);
      return invoke("window:setTitleBarOverlay", [colors]);
    };
    api.showSystemMenu = showSystemMenu;

    (listeners["host:windowState"] = listeners["host:windowState"] || []).push(function (payload) {
      setMaximized(payload && payload.maximized);
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  if (HOST.chromeless) setupChromeless();

  Object.defineProperty(window, "memoryStack", { value: Object.freeze(api), enumerable: true });

  // With a native frame the window keeps its own title bar and buttons, so the page's draggable strip doesn't
  // need to reserve room for Electron's overlay buttons or offer a look-alike system menu.
  if (!HOST.chromeless) {
    document.addEventListener("DOMContentLoaded", function () {
      var style = document.createElement("style");
      style.setAttribute("data-cairn-host", "native-chrome");
      style.textContent =
        ".titlebar-drag{padding-right:12px !important}" +
        ".titlebar-app-icon-btn{pointer-events:none}";
      document.head.appendChild(style);
    });
  }
})();
