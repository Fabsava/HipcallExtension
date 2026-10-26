// config.local.example.js - Yerel geliştirme için örnek dosya
// Bu dosyayı "config.local.js" olarak kopyalayıp kendi Hipcall bilgilerinizi girebilirsiniz.
if (typeof HIPCALL_CONFIG !== "undefined") {
  HIPCALL_CONFIG.clientId = "YOUR_HIPCALL_CLIENT_ID";
  HIPCALL_CONFIG.redirectUri = "https://YOUR_SUBDOMAIN.ngrok-free.dev/callback";
  HIPCALL_CONFIG.state = "YOUR_STATE";
}
