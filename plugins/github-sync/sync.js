// GitHub Sync view. Runs sandboxed in an iframe: it can only talk to Cairn via
// window.cairnPlugin (see the SDK served at /__cairn_sdk.js). All git work and
// the GitHub token live in the host; this file only renders state and asks for
// actions, so file names are always inserted as text, never as HTML.
(function () {
  var api = window.cairnPlugin;
  var app = document.getElementById("app");

  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  var state = {
    view: "loading", // loading | permission | signin | no-folder | link | main | error
    login: null,
    folder: null,
    link: null,
    changes: [],
    deselected: new Set(), // paths the user has unticked; everything else is selected
    message: "",
    busy: false,
    result: null, // { status, text }
    deviceCode: null,
    linkMode: "create",
    repoName: "",
    isPrivate: true,
    repos: null,
    selectedRepo: "",
    error: null,
  };

  function isPermissionError(err) {
    return /git-sync/.test(String(err && err.message));
  }

  function errText(err) {
    return String((err && err.message) || err);
  }

  async function refresh() {
    if (state.busy) return;
    try {
      var status = await api.invoke("auth.status");
      if (!status.connected) {
        state.view = "signin";
        return render();
      }
      state.login = status.login;
      var folder = await api.invoke("folder.get");
      if (!folder) {
        state.view = "no-folder";
        return render();
      }
      state.folder = folder.name;
      if (!folder.link) {
        state.link = null;
        state.view = "link";
        if (!state.repoName) state.repoName = suggestRepoName(folder.name);
        return render();
      }
      var s = await api.invoke("sync.status");
      state.link = s.link;
      state.changes = s.changes;
      var present = new Set(s.changes.map(function (c) { return c.path; }));
      state.deselected.forEach(function (p) { if (!present.has(p)) state.deselected.delete(p); });
      state.view = "main";
      state.error = null;
    } catch (err) {
      if (isPermissionError(err)) state.view = "permission";
      else {
        state.view = "error";
        state.error = errText(err);
      }
    }
    render();
  }

  function suggestRepoName(name) {
    return name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "notes";
  }

  function selectedPaths() {
    return state.changes
      .map(function (c) { return c.path; })
      .filter(function (p) { return !state.deselected.has(p); });
  }

  async function run(fn) {
    state.busy = true;
    state.result = null;
    render();
    try {
      await fn();
    } catch (err) {
      state.result = { status: "error", text: errText(err) };
    }
    state.busy = false;
    await refresh();
  }

  // ---- renderers --------------------------------------------------------

  function renderPermission() {
    return h("div", { class: "callout" },
      h("h2", {}, "Allow GitHub sync"),
      h("div", { class: "muted" }, "This plugin needs your permission to sign in to GitHub and to commit and push your notes. It never sees your GitHub token."),
      h("button", {
        class: "primary",
        onclick: async function () {
          try {
            if (await api.requestPermission("git-sync")) refresh();
          } catch (err) {
            state.error = errText(err);
            state.view = "error";
            render();
          }
        },
      }, "Review permission..."));
  }

  function renderSignIn() {
    if (state.deviceCode) {
      return h("div", { class: "panel" },
        h("div", {}, "Enter this code on GitHub (opened in your browser):"),
        h("div", { class: "code" }, state.deviceCode),
        h("div", { class: "muted" }, "Waiting for you to authorise..."),
        h("button", {
          onclick: function () {
            api.invoke("auth.cancel");
            state.deviceCode = null;
            render();
          },
        }, "Cancel"));
    }
    return h("div", { class: "callout" },
      h("h2", {}, "Connect GitHub"),
      h("div", { class: "muted" }, "Sign in to GitHub to sync this notes folder to a repository."),
      state.result && h("div", { class: "status " + state.result.status }, state.result.text),
      h("button", {
        class: "primary",
        onclick: async function () {
          state.result = null;
          try {
            var c = await api.invoke("auth.start");
            state.deviceCode = c.userCode;
            render();
            await api.invoke("auth.await");
          } catch (err) {
            state.result = { status: "error", text: errText(err) };
          }
          state.deviceCode = null;
          refresh();
        },
      }, "Connect GitHub"));
  }

  function renderLink() {
    var existing = state.linkMode === "existing";
    if (existing && state.repos === null) {
      state.repos = [];
      api.invoke("repo.list").then(function (repos) {
        state.repos = repos;
        state.selectedRepo = repos.length ? repos[0].fullName : "";
        render();
      }).catch(function (err) {
        state.result = { status: "error", text: errText(err) };
        render();
      });
    }
    return h("div", { class: "callout", role: "alert" },
      h("h2", {}, "This notes folder isn't connected to a GitHub repository"),
      h("div", { class: "muted" }, "Connect \"" + state.folder + "\" to a repository to start syncing."),
      h("div", { class: "row" },
        h("label", {}, h("input", { type: "radio", name: "mode", checked: !existing, onchange: function () { state.linkMode = "create"; render(); } }), " New repository"),
        h("label", {}, h("input", { type: "radio", name: "mode", checked: existing, onchange: function () { state.linkMode = "existing"; render(); } }), " Existing")),
      existing
        ? h("select", {
            "aria-label": "Repository",
            onchange: function (e) { state.selectedRepo = e.target.value; },
          }, (state.repos || []).map(function (r) {
            return h("option", { value: r.fullName, selected: r.fullName === state.selectedRepo }, r.fullName + (r.private ? " (private)" : ""));
          }))
        : h("div", { class: "panel", style: "margin:0" },
            h("input", { type: "text", "aria-label": "Repository name", value: state.repoName, oninput: function (e) { state.repoName = e.target.value; } }),
            h("label", {}, h("input", { type: "checkbox", checked: state.isPrivate, onchange: function (e) { state.isPrivate = e.target.checked; } }), " Private")),
      state.result && h("div", { class: "status " + state.result.status }, state.result.text),
      h("button", {
        class: "primary",
        disabled: state.busy,
        onclick: function () {
          run(async function () {
            var repo;
            if (existing) {
              repo = (state.repos || []).find(function (r) { return r.fullName === state.selectedRepo; });
              if (!repo) throw new Error("Choose a repository");
            } else {
              repo = await api.invoke("repo.create", state.repoName.trim(), state.isPrivate);
            }
            await api.invoke("link.set", repo.fullName, repo.defaultBranch);
          });
        },
      }, state.busy ? "Connecting..." : "Connect repository"));
  }

  function renderMain() {
    var selected = selectedPaths();
    var all = state.changes.length;
    var link = state.link;
    var last = link.lastSyncAt ? "Last sync " + new Date(link.lastSyncAt).toLocaleString() : "Not synced yet";

    var ops = h("div", { class: "ops" },
      h("div", { class: "repo", title: link.repoFullName }, link.repoFullName + " (" + link.branch + ")"),
      h("div", { class: "muted" }, last + (state.login ? " - @" + state.login : "")),
      h("textarea", {
        placeholder: "Commit message (optional)",
        "aria-label": "Commit message",
        oninput: function (e) { state.message = e.target.value; },
      }, state.message),
      h("div", { class: "row" },
        h("button", {
          class: "primary grow",
          disabled: state.busy || selected.length === 0,
          onclick: function () {
            run(async function () {
              var r = await api.invoke("sync.commitPush", selected, state.message);
              state.result = { status: r.status === "synced" ? "ok" : r.status, text: r.message };
              if (r.status === "synced") state.message = "";
            });
          },
        }, state.busy ? "Working..." : "Sync selected (" + selected.length + ")"),
        h("button", {
          disabled: state.busy,
          title: "Pull the latest changes from GitHub",
          onclick: function () {
            run(async function () {
              var r = await api.invoke("sync.pull");
              state.result = { status: r.status === "synced" ? "ok" : r.status, text: r.message };
            });
          },
        }, "Fetch latest")),
      h("div", { class: "row" },
        h("button", {
          class: "link",
          disabled: state.busy,
          onclick: function () {
            run(async function () {
              var out = await api.invoke("sync.fetchAll");
              state.result = {
                status: out.some(function (o) { return o.result.status !== "synced"; }) ? "error" : "ok",
                text: out.length ? out.map(function (o) { return o.name + ": " + o.result.message; }).join("\n") : "No folders are linked to GitHub.",
              };
            });
          },
        }, "Fetch all folders"),
        h("button", {
          class: "link",
          disabled: state.busy,
          onclick: function () {
            if (!confirm("Disconnect this folder from " + link.repoFullName + "? Your notes and the repository are left untouched.")) return;
            run(function () { return api.invoke("link.remove"); });
          },
        }, "Disconnect repo")),
      state.result && h("div", { class: "status " + state.result.status, style: "white-space:pre-wrap" }, state.result.text));

    var head = h("div", { class: "files-head" },
      h("input", {
        type: "checkbox",
        "aria-label": "Select all changed files",
        checked: all > 0 && selected.length === all,
        disabled: all === 0,
        onchange: function (e) {
          state.deselected = e.target.checked ? new Set() : new Set(state.changes.map(function (c) { return c.path; }));
          render();
        },
      }),
      h("span", {}, all === 0 ? "No changes" : "Changes (" + selected.length + " of " + all + " selected)"),
      h("button", { class: "link", style: "margin-left:auto", onclick: refresh, title: "Refresh" }, "Refresh"));

    var list = all === 0
      ? h("div", { class: "empty" }, "Everything is in sync with your last commit.")
      : h("ul", { class: "files" }, state.changes.map(function (c) {
          var letter = c.state === "added" ? "A" : c.state === "deleted" ? "D" : "M";
          return h("li", {},
            h("label", { title: c.path },
              h("input", {
                type: "checkbox",
                checked: !state.deselected.has(c.path),
                onchange: function (e) {
                  if (e.target.checked) state.deselected.delete(c.path);
                  else state.deselected.add(c.path);
                  render();
                },
              }),
              h("span", { class: "badge " + c.state, title: c.state }, letter),
              h("span", { class: "name" }, c.path)));
        }));

    return h("div", { style: "display:flex;flex-direction:column;height:100%;min-height:0" }, ops, head, list);
  }

  function render() {
    // Keep typing focus and scroll position across re-renders.
    var active = document.activeElement;
    var activeLabel = active && active.getAttribute && active.getAttribute("aria-label");
    var caret = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    var list = app.querySelector(".files");
    var scroll = list ? list.scrollTop : 0;

    var content;
    switch (state.view) {
      case "permission": content = renderPermission(); break;
      case "signin": content = renderSignIn(); break;
      case "no-folder": content = h("div", { class: "empty" }, "Open a notes folder to sync it."); break;
      case "link": content = renderLink(); break;
      case "main": content = renderMain(); break;
      case "error": content = h("div", { class: "callout" }, h("h2", {}, "Something went wrong"), h("div", { class: "status error" }, state.error), h("button", { onclick: refresh }, "Try again")); break;
      default: content = h("div", { class: "empty" }, "Loading...");
    }
    app.replaceChildren(content);

    var nextList = app.querySelector(".files");
    if (nextList) nextList.scrollTop = scroll;
    if (activeLabel) {
      var again = app.querySelector('[aria-label="' + activeLabel + '"]');
      if (again) {
        again.focus();
        if (caret !== null && again.setSelectionRange) again.setSelectionRange(caret, caret);
      }
    }
  }

  api.onChange(function () { refresh(); });
  refresh();
})();
