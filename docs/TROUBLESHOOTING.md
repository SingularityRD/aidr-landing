# Supabase + Vercel Troubleshooting Guide

## Hızlı Başlangıç

```bash
# Local'de env var'ları kontrol et
npm run check-env

# Build öncesi env var kontrolü ile birlikte
npm run check-env && npm run build
```

---

## Sorun 1: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"

### ✅ Çözüm Adımları

#### Adım 1: Vercel Dashboard Kontrolü

1. [vercel.com/dashboard](https://vercel.com/dashboard) adresine git
2. Projeni seç → **Settings** → **Environment Variables**
3. Şu değişkenlerin **Production** ortamında olduğunu doğrula:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### Adım 2: Değerleri Doğrula

Supabase Dashboard'dan aldığın değerler:
- **Project URL**: `https://[project-ref].supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIs...` (JWT formatında)

#### Adım 3: Kritik - Redeploy

⚠️ **EN ÖNEMLİ ADIM**: NEXT_PUBLIC_* değişkenleri build zamanında inline edilir!

1. Vercel Dashboard → **Deployments**
2. En son deployment'ı bul → **...** (üç nokta) → **Redeploy**
3. **"Use existing Build Cache"** seçeneğini **KAPAT** (❌)
4. Redeploy'u başlat

#### Adım 4: Test

```bash
# Production URL'ini kontrol et
curl -s https://your-app.vercel.app/login | grep -i "missing\|welcome\|supabase"
```

---

## Sorun 2: Preview Deployment Çalışıyor ama Production Çalışmıyor

### Neden
Preview ve Production farklı env var set'leri kullanır.

### Çözüm
1. Vercel Dashboard → Environment Variables
2. **Production** sekmesini seç (Preview değil!)
3. Değerlerin burada olduğundan emin ol
4. Production için redeploy yap

---

## Sorun 3: Local'de Çalışıyor ama Vercel'de Çalışmıyor

### Neden
`.env.local` dosyan local'de çalışır ama Vercel'de kullanılmaz.

### Çözüm
```bash
# Vercel CLI ile env var ekle (opsiyonel)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

Veya dashboard'dan manuel ekle ve **redeploy yap**.

---

## Sorun 4: "Invalid API Key" veya Auth Hataları

### Kontrol Listesi

1. **Yanlış Key Türü**:
   - ❌ Service Role Key kullanma (anon key olmalı)
   - ✅ Anon Key kullan (Project Settings → API)

2. **Key Formatı**:
   - Doğru: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Yanlış: `service_role` ile başlayan key

3. **URL Formatı**:
   - Doğru: `https://qacrbrailtemkzgwrxrt.supabase.co`
   - Yanlış: `https://qacrbrailtemkzgwrxrt.supabase.co/` (trailing slash olmamalı)

---

## Sorun 5: Build Cache Sorunu

Vercel'in build cache'i bazen eski env var'ları tutar.

### Çözüm
1. **Settings** → **Git** → **Tracked Files** bölümünde `.vercel` cache'ini temizle
2. Yeni bir commit yap (boşluk ekle, push et)
3. Veya manual redeploy: Build cache **KAPAT**

---

## Debug Komutları

### Build Loglarında Ara
```bash
# Vercel CLI ile logları gör
vercel logs --production

# Son deploy'ın ID'sini al
vercel deployments ls
```

### Local Build Test
```bash
# Production build'u local'de test et
NODE_ENV=production npm run build
npm start
```

### Supabase Bağlantı Testi
```bash
# Supabase'e doğrudan curl testi
curl -X POST 'https://[your-ref].supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: [your-anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

---

## Yaygın Hatalar ve Çözümleri

| Hata Mesajı | Neden | Çözüm |
|-------------|-------|-------|
| `Missing NEXT_PUBLIC_SUPABASE_URL` | Env var tanımlı değil veya build cache | Vercel'de env var ekle + redeploy |
| `Invalid login credentials` | Yanlış key veya URL | Anon key kullan, URL'i kontrol et |
| `CORS error` | Supabase'de CORS ayarı | Supabase Dashboard → API → CORS origins |
| `JWT expired` | Key değişmiş | Yeni key oluştur, Vercel'de güncelle |

---

## Hâlâ Çalışmıyor mu?

### Manuel Deploy (Geçici Çözüm)

```bash
# .env.production dosyasını kullanarak deploy et
vercel --prod
```

Bu komut local `.env.production` dosyanı kullanır.

### Fallback: Edge Config Kullan

Eğer env var'lar hâlâ çalışmazsa, Vercel Edge Config kullanabilirsin:
1. Vercel Dashboard → Edge Config
2. Supabase ayarlarını ekle
3. Kodu Edge Config'den okuyacak şekilde güncelle

---

## İletişim

Sorun devam ederse şunları paylaş:
1. Vercel Build Logları (Deployments → [son deploy] → Build Logs)
2. Runtime Logları (Monitoring → Runtime Logs)
3. Ekran görüntüsü (Vercel Environment Variables sayfası - değerleri gizleyerek)
