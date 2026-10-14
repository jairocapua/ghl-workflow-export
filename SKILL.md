---
name: ghl-workflow-export
description: GHL workflow export. Decode a GoHighLevel workflow the user copied from Chrome DevTools ("Copy as cURL (bash)" of the builder's save request) into WorkflowJSON/, then review it or check fixes against the previous export. Use when the user says they copied the cURL, or asks to export or desk-check a GHL workflow's steps or triggers.
---

# GHL workflow export

The GHL public API cannot read a workflow's triggers or steps. The builder's own save request carries all of them, so the user copies that request and `decode.js` turns its body into `WorkflowJSON/<name> - v<version>.json`.

## User side
Give the user these steps when the clipboard isn't ready yet:
1. Open the workflow in the builder, press F12, open **Network**, and filter on `workflow`.
2. Click **Save**. No change is needed, and the workflow stays a Draft.
3. Right-click the **PUT** row ending in the workflow ID, then **Copy → Copy as cURL (bash)**. Pick "(bash)", not "(cmd)".

## Steps
1. From the project root, run `node <this skill's base directory>/decode.js`. In a per-project install that's `node .claude/skills/ghl-workflow-export/decode.js`.
   - It reads the clipboard, saves the body, and prints `saved: <file>`.
   - Then it prints either a **diff** against the newest earlier export of the same workflow (matched by `_id`) or, on a first export, the full step **tree**.
   - On an `ERROR:` the clipboard holds something else. Ask the user to re-copy the PUT row.
2. Review the output:
   - **Diff:** check every change the user was asked to make, one by one, against the diff. Flag any change nobody asked for.
   - **Tree:** desk-check the triggers and every branch against the task's spec, using the gotchas below. Use `inspect.js <file> --tree` to see the full tree of a later version.
3. Report to the user:
   - Use a table with one row per expected change, marked ✅ or ❌. Name the exact wrong field for each ❌ and give the builder click-path to fix it.
   - List anything unexpected after the table.

## Session token
The copied cURL carries the user's GHL session token in its headers. Keep the clipboard text in memory only. `decode.js` writes the body alone, so send the clipboard nowhere else: no echo, no saved file, no log.

## Reading an export: GHL gotchas
- **Reply channel** in `customer_reply` triggers: `message.type` 2 = SMS, 3 = Email.
- **Triggers:** filters inside one trigger AND together. Separate triggers are alternatives.
- **If/Else:** a branch's conditions are joined by its segment `operator` (`and` / `or`), so check that it matches the branch name's intent. Branches are checked top to bottom and the first match wins. The `{"else": true}` node is the none-branch.
- **Empty branch:** a step with no `next` ends the contact's run. The tree marks it `[END of path]`. An empty branch where messages were expected is a silent stop.
- **`goto`** jumps to `targetNodeId`. The output shows the target step's name.
- **Opportunity steps:** `create_opportunity` needs `pipeline_id`. `internal_update_opportunity` needs a `pipelineId` entry in `__customInputFields__`; without it, the wrong opportunity, or none, gets updated.
- **`task-notification`** with `assignedTo: ""` creates an unassigned task.
- **Relative dates:** `conditionValueOperator` values such as `today`, `yesterday`, `before` + N `days`, and `inTheNext` + N `days` have unverified boundaries in GHL. Put dated cases in the live test.
- **SMS steps** point at snippets by `template_id`, and the API key (PIT) cannot read snippet text. Check SMS wording in the UI or in a live test. Email steps carry a `previewUrl` that returns the template HTML.
- **IDs:** custom field IDs in conditions and updates, user IDs, pipeline and stage IDs, and workflow IDs show up raw. Resolve them with live read-only GETs (`/locations/{loc}/customFields?model=all`, `/users/?locationId=`, `/opportunities/pipelines`, `/workflows/`), not cached copies, which miss newly created fields.
- **Drafts:** `newTriggers[].active` stays false while the workflow is a draft. Publishing can only be done in the UI.
- **Versions:** the file is named after the body's `version`, which is the version the editor loaded. GHL's saved version is one higher.
