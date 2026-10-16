<?php
// Copy to ai-config.php and upload it ONE LEVEL ABOVE public_html (your home
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
        'https://500.siaysies.com', // the app
        'http://localhost:5173',
        'https://localhost',     // Capacitor Android
        'capacitor://localhost', // Capacitor iOS
    ],

    // Requests per IP per hour.
    'rate_limit_per_hour' => 40,
];
