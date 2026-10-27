# Dosyalama Sistemi

[![CI](https://github.com/emircan-karaca/dosyalama_sistemi/actions/workflows/ci.yml/badge.svg)](https://github.com/emircan-karaca/dosyalama_sistemi/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

SMB/CIFS paylaşımı üzerinde çalışan, Google Drive benzeri web arayüzlü dosya yönetim sistemi. Kullanıcı başına ayrı depolama alanı, paylaşım, çöp kutusu, sürüm geçmişi ve admin paneli içerir.

---

## Gereksinimler

| Bileşen | Minimum |
|---------|---------|
| Docker & Docker Compose | v2+ |
| PostgreSQL | 14+ (harici sunucu) |
| SMB paylaşımı | Windows / NAS / Samba |
| Tarayıcı | Modern (Chrome, Firefox, Safari, Edge) |

> Dosyalar uygulama diskinde tutulmaz; tüm içerik SMB paylaşımına yazılır. PostgreSQL yalnızca kullanıcı, oturum, paylaşım ve audit verileri için kullanılır.

---

## Kurulum

### 1. PostgreSQL hazırlayın

PostgreSQL sunucunuzda veritabanı ve kullanıcı oluşturun:

```sql
CREATE DATABASE dosyalama;
CREATE USER dosyalama WITH ENCRYPTED PASSWORD 'guclu_sifre';
GRANT ALL PRIVILEGES ON DATABASE dosyalama TO dosyalama;
```

**Önemli:** Backend Docker container'ından PostgreSQL'e erişilebilmeli.

- `pg_hba.conf` içinde container IP aralığına izin verin
- Firewall'da 5432 portunu açın
- PostgreSQL Docker içindeyse `host` olarak servis adını veya `host.docker.internal` kullanın (macOS/Windows)

### 2. SMB paylaşımını hazırlayın

Kurulum sihirbazında gireceğiniz bilgiler:

| Alan | Örnek | Açıklama |
|------|-------|----------|
| SMB Host | `10.0.0.2` | Sunucu IP veya hostname |
| Paylaşım adı | `Y` | Windows paylaşım adı |
| Kullanıcı / Şifre | — | Paylaşıma erişim hesabı |
| Kök klasör | `/` veya `/docs` | Paylaşım içindeki başlangıç yolu |

Kullanıcı klasörleri otomatik olarak `/users/{uuid}` altında oluşturulur.

### 3. Ortam değişkenlerini ayarlayın

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:

```env
# Üretimde mutlaka değiştirin (en az 32 karakter)
ENCRYPTION_KEY=uzun-rastgele-sifreleme-anahtari-buraya
SECRET_KEY=uzun-rastgele-oturum-anahtari-buraya

BACKEND_URL=http://backend:8000
CORS_ORIGINS=http://localhost:50,http://127.0.0.1:50

# Varsayılan: doğrudan SMB (smbprotocol). Mount modu için aşağıya bakın.
STORAGE_MODE=smb
```

Güçlü anahtar üretmek için:

```bash
openssl rand -hex 32
```

### 4. Uygulamayı başlatın

```bash
docker compose up -d --build
```

Servisler ayağa kalktığında:

| Servis | Adres |
|--------|-------|
| Web arayüzü | http://localhost:50 |
| Backend API | http://localhost:51 |
| Sağlık kontrolü | http://localhost:51/api/health |

Logları izlemek için:

```bash
docker compose logs -f
```

Durdurmak için:

```bash
docker compose down
```

---

## İlk Kurulum Sihirbazı

Tarayıcıda **http://localhost:50** adresini açın. Sihirbaz 3 adımdan oluşur:

### Adım 1 — PostgreSQL

1. Host, port, veritabanı adı, kullanıcı ve şifreyi girin
2. **Test Et** ile bağlantıyı doğrulayın
3. **Kaydet ve Devam** ile ilerleyin

### Adım 2 — SMB / Disk

1. Disk görünen adını girin (sidebar'da görünür)
2. SMB sunucu, paylaşım, kullanıcı ve şifreyi girin
3. Kök klasör yolunu belirleyin (`/` önerilir; alt klasörlere arayüzden girilir)
4. **Test Et** → **Kaydet ve Devam**

### Adım 3 — Admin hesabı

1. Admin e-posta ve şifre oluşturun (min. 6 karakter)
2. Giriş yapın

Kurulum tamamlandıktan sonra `/setup` sayfasına tekrar yönlendirilmezsiniz.

---

## Kullanım Özeti

| Özellik | Konum |
|---------|-------|
| Dosya yönetimi | **Dosyalarım** — yükle, indir, sil, klasör oluştur |
| Çöp kutusu | **Çöp Kutusu** — 30 gün içinde geri yükle |
| Kullanıcı paylaşımı | Sağ tık → Kullanıcıyla Paylaş |
| Link paylaşımı | Sağ tık → Link Oluştur |
| Global arama | Arama kutusunda Enter |
| Kopyala / Taşı | Ctrl+C / Ctrl+X / Ctrl+V |
| Dosya geçmişi & sürümler | Detay paneli sekmeleri |
| Bildirimler | Sidebar → Bildirimler |
| Admin paneli | Ayarlar, Kullanıcılar, Sağlık |

---

## CIFS Mount Modu (Opsiyonel)

SMB protokolü yerine paylaşımı container içine mount etmek isterseniz `.env` dosyasına ekleyin:

```env
STORAGE_MODE=mount
SMB_MOUNT_ENABLED=true
SMB_MOUNT_HOST=10.0.0.2
SMB_MOUNT_SHARE=Y
SMB_MOUNT_USERNAME=kullanici
SMB_MOUNT_PASSWORD=sifre
```

> Mount modu `SYS_ADMIN` ve `/dev/fuse` gerektirir; `docker-compose.yml` içinde tanımlıdır. Admin panelinden de depolama modu değiştirilebilir.

---

## Geliştirme Ortamı (Docker olmadan)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export ENCRYPTION_KEY=dev-encryption-key-change-in-production!!
export SECRET_KEY=dev-secret-key-change-in-production!!
export DATA_DIR=./data
export CORS_ORIGINS=http://localhost:3000

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

Frontend: http://localhost:3000 — Backend: http://localhost:8000

> Docker olmadan çalışırken PostgreSQL ve SMB bilgileri yine kurulum sihirbazından girilir. `DATA_DIR` altında `config.json` oluşturulur.

---

## Ortam Değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `ENCRYPTION_KEY` | Evet | SMB şifresi vb. şifreli alanlar için |
| `SECRET_KEY` | Evet | Oturum çerezleri için |
| `CORS_ORIGINS` | Hayır | Frontend origin listesi (virgülle ayrılmış) |
| `BACKEND_URL` | Docker | Frontend → backend proxy adresi |
| `STORAGE_MODE` | Hayır | `smb` (varsayılan) veya `mount` |
| `SMB_MOUNT_*` | Mount modu | CIFS mount bilgileri |

PostgreSQL ve SMB bağlantı bilgileri **`.env` dosyasında değil**; kurulum sihirbazı veya admin panelinden kaydedilir.

---

## Sorun Giderme

### PostgreSQL bağlantı hatası

- Host'un container'dan erişilebilir olduğunu doğrulayın
- Docker Desktop kullanıyorsanız `host.docker.internal` deneyin
- `docker compose logs backend` ile hata detayına bakın

### SMB bağlantı hatası

- Admin → **Ayarlar** → **Bağlantıyı Test Et**
- Admin → **Sağlık** → SMB teşhis sonuçlarını inceleyin
- Paylaşım adının doğru olduğundan emin olun (`\\host\PAYLASIM`)

### `STATUS_DELETE_PENDING` / silme-yükleme hatası

Finder veya Windows Gezgini aynı SMB paylaşımına bağlıysa dosyalar kilitlenir.

1. Finder/Gezgin'de paylaşım bağlantısını kesin
2. 10 saniye bekleyin
3. Admin → Ayarlar → **Bağlantıyı Sıfırla** veya **Kök Klasörü / Yap**

### Kurulum sıfırlama

Veritabanını ve volume'u temizleyerek sıfırdan kurulum:

```bash
docker compose down -v
docker compose up -d --build
```

> `-v` flag'i `app_data` volume'unu siler; kurulum ayarları ve bootstrap config kaybolur. PostgreSQL veritabanı harici olduğu için ayrıca temizlemeniz gerekebilir.

---

## Mimari

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js    │────▶│   FastAPI    │────▶│  PostgreSQL     │
│  :50        │     │   :51        │     │  (harici)       │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  SMB / CIFS  │
                    │  /users/...  │
                    └──────────────┘
```

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 15, Mantine UI |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Depolama | smbprotocol veya CIFS mount |
| Veritabanı | PostgreSQL (asyncpg) |

---

## API Özeti

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/health` | Sağlık durumu |
| `GET /api/setup/status` | Kurulum adımı |
| `POST /api/setup/save-db` | PostgreSQL kaydet |
| `POST /api/setup/save-smb` | SMB kaydet |
| `GET /api/files?path=...` | Dosya listesi |
| `POST /api/files/upload` | Dosya yükle |
| `GET /api/files/search?q=...` | Global arama |
| `GET /api/trash` | Çöp kutusu |
| `GET /api/notifications` | Bildirimler |
| `GET /api/public/share/{token}` | Public link erişimi |

Tam API dokümantasyonu: http://localhost:51/docs (Swagger)

---

## Lisans

Bu proje dahili kullanım içindir.
