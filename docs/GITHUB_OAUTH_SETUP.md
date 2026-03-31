# GitHub OAuth Setup Guide (Çok Kolay!)

GitHub OAuth, Google'dan çok daha basit kurulur. Hiç onay beklemeden hemen Client ID/Secret alırsın.

---

## 🚀 Adım Adım Kurulum (5 Dakika)

### Adım 1: GitHub OAuth App Oluştur (2 dk)

1. **GitHub'a git**: https://github.com
2. Sağ üst köşe profil fotoğrafın → **Settings**
3. En altta sol menü: **Developer settings**
4. **OAuth Apps** → **New OAuth App**

5. Şunları doldur:

   | Alan | Değer |
   |------|-------|
   | **Application name** | Singularity AIDR |
   | **Homepage URL** | `https://aidr.singularityrd.com` |
   | **Application description** | (opsiyonel) AI Agent Protection |
   | **Authorization callback URL** | `https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback` |

   ⚠️ **Callback URL kritik!** Aynen şöyle olmalı:
   ```
   https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback
   ```

6. **Register application** butonuna tıkla

7. 🎉 **Client ID** hemen gösterilecek! (kopyala)

8. **Generate a new client secret** butonuna tıkla
   - Secret oluşacak, **hemen kopyala!** (bir daha gösterilmez)

---

### Adım 2: Supabase'e Ekle (1 dk)

1. **Supabase Dashboard**: https://supabase.com/dashboard
2. **aidr** projesini seç
3. Sol menü: **Authentication** → **Providers**
4. **GitHub** satırını bul → Tıkla

5. Ayarlar:
   - ✅ **Enable Sign in with GitHub**: AÇ (yeşil yap)
   - **Client ID**: [GitHub'dan kopyaladığını yapıştır]
   - **Client Secret**: [GitHub'dan kopyaladığını yapıştır]

6. **Save** tıkla

---

### Adım 3: Kodu Güncelle (2 dk)

GitHub butonu ekleyeceğiz. `src/app/(auth)/login/page.tsx` dosyasına şunları ekle:

Login sayfasında "Continue with Google" butonunun yanına "Continue with GitHub" butonu eklenecek.

---

### Adım 4: Test Et (Anında!)

1. Uygulamayı aç: `https://aidr.singularityrd.com/login`
2. **"Continue with GitHub"** butonuna tıkla
3. GitHub yetkilendirme ekranı gelecek
4. **"Authorize Singularity AIDR"** tıkla
5. 🎉 Giriş başarılı! Dashboard'a yönlendirileceksin

---

## 🆚 Google vs GitHub OAuth

| Özellik | Google OAuth | GitHub OAuth |
|---------|--------------|--------------|
| **Kurulum süresi** | 10-15 dk | 3-5 dk |
| **Onay bekleme** | Gerekebilir | **Yok, anında çalışır** |
| **Client ID/Secret** | Karmaşık alınır | **Hemen verilir** |
| **Kullanıcı kitlesi** | Herkes | Developer'lar |

**Öneri**: GitHub OAuth daha kolay ve hızlı. Kullanıcıların çoğu developer olduğu için uygun.

---

## ⚠️ Dikkat Edilecekler

### Callback URL Doğru mu?
Eğer hata alırsan:
- GitHub OAuth App → Callback URL kontrol et
- Mutlaka şöyle olmalı: `https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback`
- Trailing slash (`/`) olmamalı

### Private Email
Bazı kullanıcıların GitHub email'i private olabilir. Supabase'de şu ayarı aç:
- GitHub Provider ayarları → **Allow users without an email**: ✅ AÇ

---

## 🎉 Hazır mısın?

Başlayalım mı?

**GitHub'da OAuth App oluştur:**
1. https://github.com/settings/developers adresine git
2. OAuth Apps → New OAuth App
3. Yukarıdaki değerleri gir
4. Client ID ve Secret kopyala
5. Bana Client ID ve Secret'i güvenli şekilde göster (tam metin yerine ilk/son 5 karakteri yazabilirsin)

Hemen başlayalım mı? 🚀
