<?php
// Settings for the ohjeyti server scripts (ai-polish.php and account.php).
// Copy to ohjeyti-config.php and upload it ONE LEVEL ABOVE public_html (your home
// folder), so it can never be downloaded from the web. Never commit the real file.

return [
    // Create a key at https://aistudio.google.com/apikey
    'gemini_api_key' => 'PASTE-YOUR-GEMINI-API-KEY',

    // Tried in order: if one is busy or retired, the next is used.
    // Check https://ai.google.dev/gemini-api/docs/models for current model names.
    'gemini_models' => [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
    ],

    // Origins allowed to call the endpoint: your site, local dev, and the Capacitor APK.
    'allowed_origins' => [
        'https://500hrs.siaysies.com', // the site (landing page + app)
        'https://500.siaysies.com',
        'http://localhost:5173',
        'https://localhost',     // Capacitor Android
        'capacitor://localhost', // Capacitor iOS
    ],

    // AI polishing requests per IP per hour.
    'rate_limit_per_hour' => 40,

    // --- Accounts and online backup (account.php) -------------------------------
    // hPanel -> Databases -> MySQL Databases: create a database and user, then
    // run account-setup.sql in phpMyAdmin.
    'db' => [
        'host' => 'localhost',
        'name' => 'u123456789_ohjeyti',
        'user' => 'u123456789_ohjeyti',
        'password' => 'PASTE-YOUR-DATABASE-PASSWORD',
    ],

    // --- Admin page (admin.php) ------------------------------------------------------
    // Open admin.php once to generate this from your chosen password.
    'admin_password_hash' => '',

    // Times in downloaded daily time records.
    'timezone' => 'Asia/Manila',

    // Where backed-up photos are stored. Must be OUTSIDE public_html.
    'data_dir' => dirname(__FILE__) . '/ohjeyti-data',
];
