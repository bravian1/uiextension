# Deployment Guide — Gemini Screen Scribe

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) — already installed at `/tmp/google-cloud-sdk/bin/gcloud`
- A Google Cloud project with billing enabled

---

## 1. Google Cloud Setup

### Authenticate and set project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com
```

### Create Firestore database (Native mode)

```bash
gcloud firestore databases create --location=nam5
```

> `nam5` = US multi-region. Use `eur3` for Europe or a specific region like `us-central1`.

---

## 2. Deploy Backend to Cloud Run

```bash
cd backend

gcloud run deploy gemini-screen-scribe-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_gemini_api_key_here
```

> Get your Gemini API key at https://aistudio.google.com/app/apikeys

After deploy, gcloud prints:
```
Service URL: https://gemini-screen-scribe-backend-xxxxxxxxxx-uc.a.run.app
```

**Save this URL** — you need it in the next step.

### (Recommended) Use Secret Manager instead of env var

```bash
# Store the key as a secret
echo -n "your_gemini_api_key_here" | \
  gcloud secrets create gemini-api-key --data-file=-

# Grant Cloud Run access to the secret
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:$(gcloud run services describe gemini-screen-scribe-backend \
    --region us-central1 --format='value(spec.template.spec.serviceAccountName)')" \
  --role="roles/secretmanager.secretAccessor"

# Redeploy using the secret instead of env var
gcloud run deploy gemini-screen-scribe-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

### Grant Cloud Run access to Firestore

```bash
# Get the Cloud Run service account email
SA=$(gcloud run services describe gemini-screen-scribe-backend \
  --region us-central1 \
  --format='value(spec.template.spec.serviceAccountName)')

# Grant Firestore read/write access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.user"
```

---

## 3. Build & Configure the Extension

```bash
cd ..  # back to project root

# Create your .env file
cp .env.example .env
```

Edit `.env` and set the Cloud Run URL from step 2:
```
VITE_BACKEND_URL=https://gemini-screen-scribe-backend-xxxxxxxxxx-uc.a.run.app
```

Build the extension:
```bash
npm run build
```

---

## 4. Load Extension Locally (for testing)

1. Open `chrome://extensions/`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## 5. Publish to Chrome Web Store

1. Zip the `dist/` folder:
   ```bash
   cd dist && zip -r ../extension.zip . && cd ..
   ```
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Click **Add new item** and upload `extension.zip`
4. Fill in store listing details, screenshots, and submit for review

---

## Architecture Overview

```
Chrome Extension (dist/)
  └─ fetch POST /process-video
       └─ Cloud Run (backend/)
            ├─ calls Gemini API (server-side key)
            └─ saves prompt to Firestore
                 └─ sessions/{sessionId}/prompts/{id}

Chrome Extension (popup)
  └─ fetch GET /history/{sessionId}
       └─ Cloud Run
            └─ reads from Firestore → returns last 20 prompts
```

## Google Cloud Services Used

| Service | Purpose |
|---|---|
| **Cloud Run** | Hosts backend API, holds Gemini API key securely |
| **Firestore** | Stores prompt history per anonymous session |
| **Secret Manager** | (Optional) Stores Gemini API key more securely than env vars |
| **Cloud Build** | Auto-used by `gcloud run deploy --source` to build the Docker image |
