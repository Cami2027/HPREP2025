HPREP Volunteer Scheduler

A simple, all-in-one web application designed to help medical school HPREP (Health Professions Recruitment and Exposure Program) organizers manage volunteer shifts. This tool provides a centralized, interactive calendar for students to view and sign up for available volunteer opportunities.
✨ Features

    Interactive Calendar: A clean, monthly calendar view that displays all upcoming volunteer events.

    User Roles:

        User: Can create an account, view events, set availability preferences, and sign up for or withdraw from shifts.

        Administrator: Has all user capabilities, plus the ability to create, publish, and manage volunteer events.

    Secure Authentication: Users can securely sign up and log in with an email and password.

    Dynamic Event Creation: Admins can easily create new events, specifying the date, time, description, and number of volunteers needed.

    Real-Time Updates: The calendar and event details update in real-time for all users as changes are made, thanks to Firebase.

    Zero-Cost Hosting: Built to run entirely on Firebase's free "Spark Plan."

🛠️ Technology Stack

    Frontend: HTML, Tailwind CSS for styling, and vanilla JavaScript for interactivity.

    Backend & Database: Google Firebase

        Firestore: To store event and user data.

        Firebase Authentication: To manage user accounts and security.

🚀 Setup and Installation Guide

To get this application running, you must configure it with your own free Firebase project. Follow these steps carefully.
Step 1: Create a Firebase Project

    Go to the Firebase Console.

    Click "Add project" and give your project a name (e.g., "HPREP-Scheduler").

    Follow the on-screen steps to create the project. You can disable Google Analytics for this simple app.

Step 2: Get Your Firebase Configuration

    Once your project is created, you'll be on the project dashboard. Click the web icon (</>) to register a new web app.

    Give the app a nickname (e.g., "Scheduler Web App") and click "Register app".

    Firebase will display a firebaseConfig object. Copy this entire code block. It will look like this:

    const firebaseConfig = {
      apiKey: "AIza...",
      authDomain: "your-project-id.firebaseapp.com",
      projectId: "your-project-id",
      // ... and so on
    };

Step 3: Add Configuration to the HTML File

    Open the scheduler.html file in a text editor.

    Find the firebaseConfig constant inside the <script type="module"> tag at the bottom of the file.

    Replace the placeholder object with the one you copied from your Firebase project.

Step 4: Enable Firebase Services

You need to turn on the two services the app uses:

    Enable Authentication:

        In the Firebase console, go to Authentication from the left sidebar.

        Click "Get started".

        Select "Email/Password" from the list of providers and enable it.

    Enable Firestore Database:

        In the Firebase console, go to Firestore Database.

        Click "Create database".

        Start in production mode.

        Choose a server location (the default is fine).

        Go to the "Rules" tab in Firestore and replace the default rules with the following to secure your data:

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        // Public events can be read by anyone, but only created/updated by logged-in users.
        match /artifacts/{appId}/public/data/events/{eventId} {
          allow read: if true;
          allow create, update, delete: if request.auth != null;
        }

        // User-specific data (like preferences) can only be accessed by that user.
        match /artifacts/{appId}/users/{userId} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }

        Click "Publish".

Step 5: Set Your Admin Account

    Open the scheduler.html file in your browser and create an account for yourself.

    Go back to the Firebase Console -> Authentication section. You will see your account in the user list.

    Copy the User UID for your account.

    In the scheduler.html file, find the ADMIN_UIDS array in the JavaScript section.

    Replace "REPLACE_WITH_YOUR_ADMIN_UID" with the UID you just copied. You can add more UIDs to the array to give admin access to other organizers.

    // Before
    const ADMIN_UIDS = ["REPLACE_WITH_YOUR_ADMIN_UID"];

    // After
    const ADMIN_UIDS = ["qRz8...your...long...UID...here...yT3"];

Your application is now fully configured and ready to use!
🌐 Hosting

To make the scheduler accessible to your volunteers, you need to host the scheduler.html file online.

    Easiest Method (Recommended): Use Netlify Drop. Just drag and drop your scheduler.html file onto their site, and they will give you a shareable link instantly.

    Alternative Method: Use GitHub Pages by uploading the file to a public GitHub repository and enabling the Pages feature in the settings.


📎 Appendix — Firestore Admin & Rules Setup
Overview

This project uses Firebase Authentication + Firestore with role-based access control.

Admins are determined by either:

    Custom Claim: admin: true on the Firebase Auth ID token (recommended).

    Firestore Role: role: 'admin' in the user’s document.

    ⚠ Choose one method and stick with it for consistency.

1. Firestore Rules

Update rules in:
Firebase Console → Firestore Database → Rules → Publish.

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isNotAnonymous() {
      return isSignedIn() && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Admin if custom claim OR Firestore role
    function isAdmin(appId) {
      return isSignedIn() && (
        request.auth.token.admin == true ||
        get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.role == 'admin'
      );
    }

    // USERS
    match /artifacts/{appId}/users/{uid} {
      allow get: if isSignedIn() && (request.auth.uid == uid || isAdmin(appId));
      allow list: if isAdmin(appId);

      allow create: if isNotAnonymous()
        && request.auth.uid == uid
        && !(request.resource.data.role == 'admin');

      allow update: if (
          isNotAnonymous()
          && request.auth.uid == uid
          && request.resource.data.role == resource.data.role
          && request.resource.data.diff(resource.data).changedKeys().hasOnly(['preferences','email'])
        ) || isAdmin(appId);

      allow delete: if isAdmin(appId);
    }

    // EVENTS
    match /artifacts/{appId}/public/data/events/{eventId} {
      allow get, list: if true;
      allow create, update, delete: if isAdmin(appId);
    }
  }
}

    Path format:
    artifacts/<appId>/users/{uid}
    artifacts/<appId>/public/data/events/{eventId}

2. Setting Admin Users
Option A — Custom Claim (Recommended)

Requirements:

    Node.js 18+

    firebase-admin package

    Service account with firebaseauth.admin role

Install dependencies:

npm init -y
npm i firebase-admin

Create script:

// set-admin.mjs
import admin from "firebase-admin";
admin.initializeApp(); // Uses ADC (Cloud Shell) or GOOGLE_APPLICATION_CREDENTIALS

const email = "user@example.com"; // Promote by email

const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { admin: true });
console.log("Admin claim set for", email);

Run script:

node set-admin.mjs

Refresh token in client:

await firebase.auth().currentUser.getIdToken(true);

Option B — Firestore Role

Manually update the user document:

artifacts/<appId>/users/<uid>

Add:

{
  "role": "admin"
}

No token refresh required.
3. Testing Permissions
Rules Simulator

    Open Firestore Rules → Simulator.

    Test get on an event path and list on users path with/without admin.

    Use custom claims JSON when simulating a signed-in admin:

{ "admin": true, "firebase": { "sign_in_provider": "password" } }

Client check:

const res = await auth.currentUser.getIdTokenResult(true);
console.log(res.claims.admin); // true if admin via claim

4. Common Issues
Problem	Likely Cause	Fix
Admin panel visible, but listing users fails	User has Firestore role: 'admin' but no claim	Add custom claim or keep role-check in rules
All admins lost access after rules change	Hardcoded {appId} doesn’t match stored paths	Use wildcard {appId} or update __app_id in front-end
Calendar fails to load	Events path doesn’t match rules	Verify Firestore doc path format
5. Admin Management Tips

    Keep promotion/demotion logic server-side (script or callable function).

    Always refresh the ID token after changing claims.

    Never allow the client to directly set role: 'admin' on their own doc.
