# Güvenlik Politikası

## Güvenlik açığı bildirme

Güvenlik açıklarını lütfen herkese açık issue olarak açmayın. Bunun yerine GitHub'ın
**Security → Report a vulnerability** (özel güvenlik bildirimi) özelliğini kullanın.

Bildirimde şunları paylaşmanız yeterli:

- Etkilenen bileşen (backend, frontend, SMB entegrasyonu)
- Tekrar etme adımları
- Olası etkisi

## Kurulum için öneriler

- `.env` içindeki `SECRET_KEY` ve `ENCRYPTION_KEY` değerlerini varsayılan bırakmayın, uzun ve rastgele değerler kullanın.
- Uygulamayı internete açacaksanız önüne HTTPS sonlandıran bir reverse proxy koyun.
- PostgreSQL ve SMB kullanıcılarına yalnızca gereken yetkileri verin.
