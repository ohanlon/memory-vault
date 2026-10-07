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

  Object.defineProperty(window, "memoryStack", { value: Object.freeze(api), enumerable: true });

  // The host window keeps its native title bar and window buttons, so the page's own draggable title strip
  // doesn't need to reserve room for Electron's overlay buttons or offer a look-alike system menu.
  document.addEventListener("DOMContentLoaded", function () {
    var style = document.createElement("style");
    style.setAttribute("data-cairn-host", "native-chrome");
    style.textContent =
      ".titlebar-drag{padding-right:12px !important}" +
      ".titlebar-app-icon-btn{pointer-events:none}";
    document.head.appendChild(style);
  });
})();
