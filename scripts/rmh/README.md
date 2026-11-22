# Sincronizar RMH con Vigía

Ejecutar `sync.ps1` en una estación Windows autorizada con acceso a SQL Server. Lee una vista de la tienda y envía una instantánea completa por HTTPS al proyecto Supabase de Vigía. No requiere abrir un puerto entrante. Los cambios en RMH aparecen después de publicar y actualizar el catálogo en el teléfono.

1. Aplicar `supabase/migrations/20261122_rmh_catalog.sql`. Desde la administración de Supabase asignar el mismo identificador de tienda en `app_metadata.rmh_store` a sus usuarios y a una cuenta exclusiva del sincronizador. Asignar únicamente a esa cuenta `app_metadata.rmh_publisher = true` (booleano). Renovar la sesión tras cambiar la asignación.
2. El administrador de RMH debe mapear el catálogo autorizado a la vista `dbo.VigiaCatalog`. Debe devolver un registro por código, con `barcode` de texto (conservar ceros iniciales), `name` de texto, `price` como precio final al consumidor en córdobas y `stock` como existencia de esa tienda. Precio y existencia admiten NULL. Conceder SELECT sobre la vista a la identidad del sincronizador.
3. Configurar para esa identidad las variables `RMH_CONNECTION` (cadena SQL, preferiblemente autenticación integrada y cifrado con certificado válido), `VIGIA_URL`, `VIGIA_PUBLIC_KEY`, `VIGIA_SYNC_EMAIL` y `VIGIA_SYNC_PASSWORD`. Mantener las credenciales en la estación autorizada.
4. Ejecutar el script y revisar el total publicado. Para actualizaciones periódicas, usar el Programador de tareas de Windows con la frecuencia de la tienda y evitar ejecuciones superpuestas.
5. En Vigía abrir **Menú → Tienda**, actualizar y contrastar un código, precio y existencia conocidos con RMH. Después de descargar, los datos quedan disponibles en ese navegador para la misma cuenta y tienda.
