# ghl-workflow-export

A [Claude Code](https://claude.com/claude-code) skill for exporting and reviewing GoHighLevel (GHL) workflows.

The GHL public API can't read a workflow's triggers or steps. The workflow builder's own save request contains all of them. You copy that request from Chrome DevTools, and this skill:

1. Decodes it into `WorkflowJSON/<workflow name> - v<version>.json` in your project.
2. Shows what changed since the last export of the same workflow. On a workflow's first export, it shows the full step tree instead.
3. Has Claude review the result: whether requested fixes landed, plus known GHL gotchas such as an Email/SMS reply-channel mix-up, AND vs OR between conditions, empty branches, opportunity steps with no pipeline, and unassigned tasks.

## Install

Per project (run from the project root):

```bash
git clone https://github.com/jairocapua/ghl-workflow-export.git .claude/skills/ghl-workflow-export
```

For every project on your machine:

```bash
git clone https://github.com/jairocapua/ghl-workflow-export.git ~/.claude/skills/ghl-workflow-export
```

Update with `git pull` inside that folder. Requires Node.js.

## Use

1. Open the workflow in the GHL builder, press **F12**, open the **Network** tab, and filter on `workflow`.
2. Click **Save** in the builder. No change is needed, and the workflow stays a Draft.
3. Right-click the **PUT** request to `backend.leadconnectorhq.com/workflow/<location>/<workflow id>` and choose **Copy → Copy as cURL (bash)**.
4. In Claude Code, run `/ghl-workflow-export` or just say "copied".

You can also run the scripts directly from the project root:

```bash
node .claude/skills/ghl-workflow-export/decode.js            # read the clipboard, save, then diff or tree
node .claude/skills/ghl-workflow-export/decode.js curl.txt   # read the cURL from a file instead
node .claude/skills/ghl-workflow-export/inspect.js "WorkflowJSON/<file>.json" [older.json | --tree]
```

The clipboard is read with PowerShell on Windows, `pbpaste` on macOS, and `wl-paste`, `xclip` or `xsel` on Linux.

## Security

The copied cURL includes your GHL session token in its headers. `decode.js` writes only the request body (the workflow itself) and never prints or saves the headers.

The exported JSON still holds your workflow content (message copy, user and field IDs). Add `WorkflowJSON/` to `.gitignore` if your project repo shouldn't store it.
