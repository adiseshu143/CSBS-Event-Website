# CSBS Event Registration Frontend

A modern, professional event registration page built with React + TypeScript + Vite.

## 🎨 Features

- Clean, modern SaaS-style design
- Fully responsive (mobile, tablet, desktop)
- Dynamic team member form generation
- Real-time form validation
- Google Apps Script integration for backend submissions
- Firebase configuration ready
- Professional typography (Bebas Neue + Inter)
- Smooth animations and hover effects
- Customizable event configuration

## 📋 Prerequisites

- Node.js 16+
- npm or yarn
- Google Apps Script deployment URL
- Firebase credentials (optional, for future enhancements)

## 🚀 Quick Start

### 1. Clone & Install

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Google Apps Script Endpoint
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec

# App Configuration
VITE_APP_NAME=CSBS Tech Fest 2026
VITE_TOTAL_SLOTS=50
VITE_MAX_TEAM_SIZE=5
```

### 3. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5174` (or shown URL)

### 4. Build for Production

```bash
npm run build
```

## 📁 Project Structure

```
src/
├── components/
│   ├── EventRegistration.tsx    # Main registration component
│   └── EventRegistration.css    # Component styles
├── services/
│   ├── firebaseConfig.ts        # Firebase configuration
│   ├── googleAppsScript.ts      # Google Apps Script API
│   └── index.ts                 # Service exports
├── App.tsx                      # App root component
├── index.css                    # Global styles
└── main.tsx                     # React entry point
```

## 🔌 Google Apps Script Integration

### Setup Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Create a new project
3. Replace the code with your form handler:

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Add your data processing logic here
    // For example, write to Google Sheets:
    const sheet = SpreadsheetApp.getActiveSheet();
    sheet.appendRow([
      new Date(),
      data.leaderName,
      data.email,
      data.phone,
      data.branch,
      data.section,
      data.teamSize,
      JSON.stringify(data.teamMembers)
    ]);
    
    // Send confirmation email
    GmailApp.sendEmail(data.email, 'Registration Confirmation', 'Your registration has been received!');
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error: ' + error);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. Deploy as web app:
   - Click "Deploy" → "New deployment"
   - Select "Web app"
   - Execute as: Your account
   - Anyone anonymous can access
5. Copy the deployment URL and add to `.env` as `VITE_GOOGLE_APPS_SCRIPT_URL`

## 🎯 Key Services

### Google Apps Script Service (`src/services/googleAppsScript.ts`)

Handles form submission to Google Apps Script:

```typescript
import { submitFormToGAS, prepareFormData } from '../services';

// Prepare data
const formData = prepareFormData(
  leaderName,
  email,
  phone,
  branch,
  section,
  teamSize,
  teamMembers
);

// Submit
const response = await submitFormToGAS(formData);
if (response.success) {
  // Handle success
}
```

### Firebase Config Service (`src/services/firebaseConfig.ts`)

Provides Firebase configuration validation (ready for future Firebase features):

```typescript
import { getFirebaseConfig, isFirebaseConfigValid } from '../services';

if (isFirebaseConfigValid()) {
  // Initialize Firebase
}
```

## 🎨 Customization

### Update Event Configuration

Edit `.env` to change:

- App name: `VITE_APP_NAME`
- Total slots: `VITE_TOTAL_SLOTS`
- Max team size: `VITE_MAX_TEAM_SIZE`

### Update Branches & Sections

Edit [EventRegistration.tsx](src/components/EventRegistration.tsx):

```typescript
const BRANCHES = ['CS & BS', 'CSE', 'IT', ...];
const SECTIONS = ['A', 'B', 'C', 'D'];
```

### Customize Colors

Edit `src/index.css` CSS variables:

```css
:root {
  --primary: #2e3190;           /* Dark Blue */
  --accent: #eb4d28;            /* Orange-Red */
  --bg-main: #ffffff;           /* White */
}
```

## 🔐 Environment Variables

All sensitive data is stored in `.env` (never commit to Git):

- ✅ Firebase credentials
- ✅ Google Apps Script URL
- ✅ App configuration

`.env.example` shows the required structure.

## 📦 Production Deployment

### Before deploying:

1. Ensure `.env` is in `.gitignore` ✅
2. Copy `.env.example` — don't commit `.env`
3. Set environment variables in your hosting platform:
   - Vercel: Settings → Environment Variables
   - GitHub Pages: Not suitable (needs backend)
   - Netlify: Site settings → Build & deploy → Environment

### Deploy Command

```bash
npm run build
# Upload `dist/` folder to your host
```

## 📝 Environment Variables Checklist

- [ ] `VITE_FIREBASE_API_KEY` configured
- [ ] `VITE_FIREBASE_PROJECT_ID` configured
- [ ] `VITE_GOOGLE_APPS_SCRIPT_URL` configured
- [ ] `.env` added to `.gitignore`
- [ ] `.env.example` in repository for reference

## 🐛 Troubleshooting

### Form not submitting?

1. Check `.env` has `VITE_GOOGLE_APPS_SCRIPT_URL`
2. Verify Google Apps Script deployment is active
3. Check browser console for errors

### Styles not loading?

```bash
npm run dev
# Clear browser cache (Cmd+Shift+Delete)
```

### Build errors?

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📖 Scripts

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## 📄 License

All rights reserved © 2026 CSBS Department

## 🎉 Support

For issues or questions, contact the development team.
