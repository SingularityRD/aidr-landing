# Google OAuth Setup Guide

## Quick Answer: Nasıl Enable Edeceksin

Supabase Dashboard'da şu anda **Google** → **Disabled** görünüyor. Enable yapmak için:

1. **Google** satırına tıkla
2. **"Enable Sign in with Google"** toggle'ını AÇ
3. **Client ID** ve **Client Secret** gir
4. **Save** butonuna tıkla

Bu kadar! Ama Client ID/Secret nereden alınacak? İşte adım adım:

---

## 1. Google Cloud Console'da OAuth Credentials Alma

### Adım 1: Google Cloud Console'a Git
- URL: https://console.cloud.google.com/
- Google hesabınla giriş yap

### Adım 2: Proje Oluştur/Seç
- Üst kısımdaki proje seçiciden **"New Project"** seç veya mevcut projeyi kullan
- Proje adı: "AIDR Auth" veya istediğin herhangi bir isim

### Adım 3: OAuth Consent Screen Ayarla

1. Sol menü: **APIs & Services** → **OAuth consent screen**
2. **User Type** seç:
   - **External** (herkes kullanabilir - uygulaman için bu)
   - **Internal** (sadece Google Workspace kullanıcıları)
3. **CREATE** tıkla

4. **App Information** doldur:
   - **App name**: Singularity AIDR
   - **User support email**: anill.yagiz@gmail.com
   - **App logo**: (opsiyonel) AIDR logosu
   - **App domain**: https://aidr.singularityrd.com
   - **Developer contact email**: anill.yagiz@gmail.com

5. **Scopes** sayfasında **"Add or Remove Scopes"**:
   - Aşağıya kaydır, şu scope'ları bul ve işaretle:
     - `openid` (OpenID Connect)
     - `userinfo.email` (Email adresini gör)
     - `userinfo.profile` (Profil bilgilerini gör)
   - **Update** tıkla
   - **Save and Continue**

6. **Test Users** (opsiyonel):
   - Kendi email adresini ekle: anill.yagiz@gmail.com
   - **Save and Continue**

7. **Summary** sayfasını incele ve **Back to Dashboard**

### Adım 4: Credentials Oluştur

1. Sol menü: **APIs & Services** → **Credentials**
2. **+ CREATE CREDENTIALS** → **OAuth client ID**
3. **Application type**: **Web application**
4. **Name**: AIDR Web Client

5. **Authorized redirect URIs** ekle (Kritik!):
   ```
   https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback
   ```
   - **ADD URI** butonuna tıkla
   - Yukarıdaki URL'i yapıştır

6. **CREATE** butonuna tıkla

7. **Client ID** ve **Client Secret** gösterilecek:
   - **İkisini de kopyala!** (Secret bir daha gösterilmeyecek)
   - Notepad veya güvenli yere kaydet

---

## 2. Supabase'e Credentials Ekle

### Adım 1: Supabase Dashboard'a Git
- https://supabase.com/dashboard
- Projeni seç: **aidr**

### Adım 2: Google Provider'ı Aç

1. Sol menü: **Authentication** (şu an oradasın)
2. **Sign In / Providers** sekmesi (şu an oradasın)
3. **Google** satırına tıkla
4. **Enable Sign in with Google** toggle'ını **AÇ** (yeşil yap)

### Adım 3: Credentials Gir

1. **Client IDs** alanına:
   ```
   123456789-abc123def456.apps.googleusercontent.com
   ```
   - Google Cloud Console'dan kopyaladığın **Client ID**'yi yapıştır

2. **Client Secret (for OAuth)** alanına:
   ```
   GOCSPX-abc123_def456_secret789
   ```
   - Google Cloud Console'dan kopyaladığın **Client Secret**'ı yapıştır

3. **Skip nonce checks**: KAPAT (güvenlik için)
4. **Allow users without an email**: KAPAT

4. **Save** butonuna tıkla

---

## 3. Google Cloud'da Redirect URL'leri Ekle

Supabase'deki callback URL'i Google'a da eklemelisin:

1. Google Cloud Console → **Credentials**
2. **AIDR Web Client**'i bul ve tıkla (kalem ikonu)
3. **Authorized redirect URIs** bölümüne şunu ekle:
   ```
   https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback
   ```
4. **SAVE** tıkla

Ayrıca production domain'lerini de ekle:
```
https://aidr.singularityrd.com/auth/callback
http://localhost:3000/auth/callback
```

---

## 4. Test Et

1. Uygulamayı aç: https://aidr.singularityrd.com/login
2. **"Continue with Google"** butonuna tıkla
3. Google giriş popup'ı açılmalı
4. Email seç → Giriş yap
5. **/onboarding** veya **/dashboard** sayfasına yönlendirilmelisin

---

## ⚠️ Yaygın Hatalar

### "Error 400: redirect_uri_mismatch"
**Neden**: Google Cloud'da redirect URL yanlış veya eksik
**Çözüm**: 
- Google Cloud Console → Credentials → OAuth 2.0 Client IDs
- Authorized redirect URIs kontrol et
- `https://qacrbrailtemkzgwrxrt.supabase.co/auth/v1/callback` eklendi mi?

### "Unsupported provider"
**Neden**: Supabase'de Google provider kapalı
**Çözüm**: Supabase Dashboard → Auth → Providers → Google → Enable

### "Access blocked: This app's request is invalid"
**Neden**: OAuth consent screen tamamlanmamış
**Çözüm**: Google Cloud → APIs & Services → OAuth consent screen → Complete

### "403: restricted_client"
**Neden**: App henüz Google'dan onay almamış (production için)
**Çözüm**: 
- Test kullanıcısı olarak kendini ekle (OAuth consent screen → Test users)
- VEYA Production için Google'dan onay iste (birkaç gün sürer)

---

## 🎉 Başarılı Olduğunda

Artık kullanıcılar:
1. "Continue with Google" tıklayacak
2. Google hesaplarıyla giriş yapacak
3. Otomatik olarak uygulamaya yönlendirilecek
4. Session cookie oluşturulacak

---

## Ek Güvenlik Önerileri

1. **Production onayı**: Kullanıcılar "Google hasn't verified this app" uyarısı görmesin istiyorsan:
   - Google Cloud → OAuth consent screen → **PUBLISH APP**
   - Google inceleme süreci (1-7 gün)

2. **Domain verification**: 
   - Google Search Console'a domain ekle
   - DNS doğrulaması yap

3. **Client Secret'ı koru**: 
   - Asla frontend kodunda paylaşma
   - Sadece Supabase Dashboard'a gir (güvenli)

---

## Yardım Lazım mı?

Hata alırsan bana şunları göster:
1. Google Cloud Console'daki **hata mesajının tamamı**
2. Browser console'daki (F12) kırmızı hatalar
3. Supabase Dashboard → Auth → Logs (varsa)
