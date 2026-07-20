# Deployment, CI Best Practices & Google Service Accounts

This guide covers automating your blog pipeline via GitHub Actions, establishing production-grade Continuous Integration (CI) best practices, and setting up Google Service Accounts to connect with Google Search Console (GSC) and Google Analytics 4 (GA4).

---

## 1. Running on Autopilot (GitHub Actions)

### Step 1 — Copy the Workflow File

Copy the template workflow file to your local repository directory:

```bash
cp templates/github-workflow.yml .github/workflows/auto-blog.yml
```

Open `.github/workflows/auto-blog.yml` and look for `<!-- CHANGE -->` annotations. Customize the cron timing, user emails, and branch name.

### Step 2 — Configure Repository Secrets

Add the required credentials in your GitHub Repository settings (**Settings > Secrets and variables > Actions**):

| Secret Name | Required? | Purpose |
|-------------|-----------|---------|
| `GEMINI_API_KEY` | **Yes** | Standard text/image generation and research. |
| `DATAFORSEO_LOGIN` | Optional | DataForSEO API account login. |
| `DATAFORSEO_PASSWORD` | Optional | DataForSEO API account password. |
| `GSC_SERVICE_ACCOUNT_JSON` | Optional | Google Service Account private key JSON (for Search Console). |
| `GA4_SERVICE_ACCOUNT_JSON` | Optional | Google Service Account private key JSON (for Google Analytics). |
| `CMS_ENDPOINT` | Optional | Your CMS API endpoint URL (WordPress, Ghost, etc.). |
| `CMS_USERNAME` / `CMS_PASSWORD` | Optional | Basic Auth details for WordPress REST API. |
| `CMS_ADMIN_API_KEY` | Optional | Admin API key for Ghost CMS uploads. |
| `CMS_API_TOKEN` | Optional | Access token for Webflow, Strapi, or Contentful. |
| `VERCEL_TOKEN` | Optional | Trigger production rebuilds on Vercel deployment. |
| `TELEGRAM_BOT_TOKEN` | Optional | Token from [@BotFather](https://t.me/BotFather) for chat alerts. |
| `TELEGRAM_CHAT_ID` | Optional | Group/User Chat ID for chat alerts. |

---

## 2. GitHub Actions CI Best Practices

To ensure high reliability and bypass bot/automation footprints, integrate these patterns into your YAML workflows.

### 1. Separate Cron Timings for Content vs Audits
Do not bundle content generation and performance audits into a single run. Keep them separate:

```yaml
on:
  schedule:
    - cron: '17 8 */3 * *'  # Generates content every 3 days at 8:17 AM
    - cron: '0 6 * * 1'     # Runs performance audits every Monday at 6:00 AM
    - cron: '0 6 * * 3'     # Runs content freshness checks every Wednesday at 6:00 AM
```

### 2. Random Time Jitter for Scheduled Runs
Cron executions on exact hourly marks are highly predictable bot signals. Insert a random sleep buffer (e.g. 0-90 minutes) inside your GHA steps:

```yaml
- name: Apply Time Jitter
  if: github.event_name == 'schedule'
  run: |
    # Sleep a random duration from 0 to 5400 seconds (90 mins)
    JITTER=$((RANDOM % 5400))
    echo "Sleeping ${JITTER}s (~$((JITTER / 60))min) to randomize bot footprints."
    sleep $JITTER
```

### 3. Graceful Handling of Pipeline Skips
Autoblog exits with descriptive codes when it skips execution (e.g., due to duplicate checks, cadence jitter, or quality gate rejections). Do not let these flag your GHA run as failed:

```yaml
- name: Execute Autoblog Pipeline
  id: run_pipeline
  run: |
    set +e
    npx autoblog 2>&1 | tee /tmp/autoblog.log
    EXIT_CODE=$?
    
    # Check if the exit was an expected skip condition
    if [ $EXIT_CODE -ne 0 ] && grep -q "all_duplicates\|no_topics\|skipped_jitter\|quality_rejected" /tmp/autoblog.log; then
      echo "Pipeline completed with a clean skip. Exiting gracefully."
      echo "skipped=true" >> $GITHUB_OUTPUT
      exit 0
    fi
    exit $EXIT_CODE
```

### 4. Skip Production Builds on Audits or Skips
If the run was skipped, or is an audit run, don't execute expensive compilation or deploy steps:

```yaml
- name: Build & Deploy Static Site
  if: steps.run_pipeline.outputs.skipped != 'true' && github.event.inputs.command != 'audit'
  run: npm run build
```

### 5. YAML Frontmatter Validator
Add a YAML validation step right after the generation completes to safeguard your static site compiler:

```yaml
- name: Validate Markdown YAML Frontmatter
  run: |
    for file in _posts/*.md; do
      node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$file', 'utf8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) { process.exit(1); }
        try { require('js-yaml').load(match[1]); }
        catch (e) { console.error('Invalid YAML in $file:', e.message); process.exit(1); }
      " || exit 1
    done
```

### 6. Pull and Push with Rebase
Prevent pipeline failures when multiple commits occur concurrently. Git pull with a rebase strategy:

```yaml
- name: Commit & Push New Posts
  run: |
    git config --global user.name "github-actions[bot]"
    git config --global user.email "github-actions[bot]@users.noreply.github.com"
    git add _posts/ public/images/blog/ .autoblog-context.json
    
    if git diff --staged --quiet; then
      echo "No content generated."
      exit 0
    fi
    
    git commit -m "feat: auto-publish $(date +%Y-%m-%d) blog post [skip ci]"
    git stash --include-untracked || true
    git pull --rebase origin main
    git stash pop || true
    git push
```

---

## 3. Google Service Account Setup (GSC + GA4)

Connect your pipeline to Google's API cloud to access Search Console impression analytics and GA4 conversion metrics.

### Step 1 — Create GCP Project and Enable APIs
Install the Google Cloud CLI (`gcloud`) or use the Cloud Console browser:

```bash
# Create project
gcloud projects create your-autoblog-project-id
gcloud config set project your-autoblog-project-id

# Enable Google APIs
gcloud services enable searchconsole.googleapis.com analyticsdata.googleapis.com analyticsadmin.googleapis.com siteverification.googleapis.com
```

### Step 2 — Create Service Account & Keys

```bash
# Create service account
gcloud iam service-accounts create autoblog-agent --display-name="Autoblog Pipeline Agent"

# Generate private key JSON and save locally
gcloud iam service-accounts keys create ~/autoblog-service-account.json \
  --iam-account=autoblog-agent@your-autoblog-project-id.iam.gserviceaccount.com
```

### Step 3 — Grant Project-Level Permissions

```bash
# Assign viewer permission
gcloud projects add-iam-policy-binding your-autoblog-project-id \
  --member="serviceAccount:autoblog-agent@your-autoblog-project-id.iam.gserviceaccount.com" \
  --role="roles/viewer"

# Assign usage consumer permission
gcloud projects add-iam-policy-binding your-autoblog-project-id \
  --member="serviceAccount:autoblog-agent@your-autoblog-project-id.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

### Step 4 — Connect Search Console
1. Copy the email address of the service account: `autoblog-agent@your-autoblog-project-id.iam.gserviceaccount.com`.
2. Open your Google Search Console panel. Select your website property.
3. Navigate to **Settings > Users and permissions > Add User**.
4. Paste the email address and assign **Owner** or **Full** permissions (Owner is required if you want GSC-Informed keyword strategies to verify site-verification properties automatically).

### Step 5 — Connect Google Analytics 4
1. Open your GA4 Admin Console panel.
2. Select **Property Access Management** under the correct Property.
3. Click the blue **+** sign, select **Add users**, paste the service account email, and grant **Viewer** permissions.

### Step 6 — Set Environment Variables

```bash
export GSC_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"
export GA4_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"
```

Then reference them in `autoblog.config.mjs`:

```javascript
gsc: {
  enabled: true,
  propertyUrl: 'sc-domain:your-site.com',
  schedule: { frequency: 'weekly' },
},
analytics: {
  enabled: true,
  propertyId: '123456789', // Your GA4 Property ID
}
```
