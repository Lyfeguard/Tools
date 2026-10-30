# Releasing

A release is a GitHub release with a version tag. Webflow loads every file at a tag, so nothing goes live until it's released and published.

- [Versions](#versions)
- [Releasing a version](#releasing-a-version)
- [Running the workflow by hand](#running-the-workflow-by-hand)
- [The sync script](#the-sync-script)
- [A new major version](#a-new-major-version)

## Versions

Versions follow [semantic versioning](https://semver.org): `v2.0.1` for a patch, `v2.1.0` for a new feature, `v3.0.0` for a change that needs new code in Webflow. Pre-releases carry a suffix (`v2.1.0-beta.1`).

| Loaded from | By | Updated |
|---|---|---|
| `@{{Release}}` | Each Tools page (template head) | The workflow sets each item's Release field |
| `@2` | The site-wide footer, and the Guides and Insights embeds | jsDelivr serves the newest 2.x release; the workflow refreshes its cache |

## Releasing a version

1. **Merge the pull request.** It should include the version in `src/v2/prelude.js` and an entry in `CHANGELOG.md`.
2. **Publish a GitHub release** (Releases > Draft a new release), tagged with the new version on `main`.
3. **The Release to Webflow workflow runs by itself** (`.github/workflows/release.yml`). It uses the `WEBFLOW_TOKEN` secret (CMS read and write). Through the Webflow CMS API, as staged changes, it:
   - sets every Tools item's **Release** field to the tag;
   - writes the **Calculator markup** and **Component Key** fields from `markup/` wherever they differ;
   - refreshes jsDelivr's `@2` copies of `lg-track.min.js` and `lg-dl.min.js`.

   The run's summary lists what changed.
4. **Publish to the staging site** (the webflow.io subdomain) and check the calculators. Staging shares the live site's CMS, so the staged changes show there first.
5. **Publish to the live domains.**

Nothing in Webflow's code changes.

## Running the workflow by hand

Go to Actions > Release to Webflow > Run workflow.

| Input | Use |
|---|---|
| `tag` | The release to point the calculators at. Leave it blank for the latest. Give an earlier tag to **roll back**, then publish. |
| `only` | Only these calculators, by key, comma-separated (e.g. `take-home-pay`). Use it to try a release on one calculator first. |
| `dry_run` | List what would change, without writing anything. |

- **Pre-releases** (`v2.1.0-beta.1`) don't run the workflow by themselves. Try them by hand with `only`.
- **Partial runs** (with `only`) and dry runs leave the `@2` copies alone.

## The sync script

The workflow runs `scripts/webflow-markup.js`. You can run it locally too:

```bash
WEBFLOW_TOKEN=... node scripts/webflow-markup.js sync --release v2.0.1 --only take-home-pay --dry-run
```

| Command | Does |
|---|---|
| `sync [--release <tag>] [--only key,key] [--dry-run]` | Writes the code-owned fields of every item that differs, as staged changes. It leaves draft status as it is. |
| `check <file>` | Compares a saved `list_collection_items` response with the repository, and lists out-of-date items and wrong Component Keys |
| `field <key>` | Prints one item's Calculator markup field value, as JSON |

Item IDs come from `webflow/cms-items.json`.

## A new major version

`@2` never moves to v3 by itself. After releasing `v3.0.0`, change `@2` to `@3` by hand in:

- the site-wide footer code ([webflow.md](webflow.md#site-wide-custom-code));
- the Guides embed (`webflow/guides-download-embed.html`);
- the Insights embed (`webflow/insights-download-embed.html`).
