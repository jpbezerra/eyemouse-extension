# Modelo do MediaPipe (não incluído no repositório)

Este diretório precisa conter `face_landmarker.task` antes de rodar
`npm run build`. Gere-o com:

```bash
npm run download-model
```

Se sua rede bloquear `storage.googleapis.com` (comum em redes corporativas
com allowlist), baixe manualmente e salve o arquivo aqui:

https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
