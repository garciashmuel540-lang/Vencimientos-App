# Sincronizar RMH con Vigía

Ejecutar `sync.ps1` en una estación Windows autorizada con acceso a SQL Server. Lee una vista de la tienda y envía una instantánea completa por HTTPS al proyecto Supabase de Vigía. No requiere abrir un puerto entrante. Los cambios en RMH aparecen después de publicar y actualizar el catálogo en el teléfono.

1. Aplicar `supabase/migrations/20261122_rmh_catalog.sql`. Desde la administración de Supabase asignar el mismo identificador de tienda en `app_metadata.rmh_store` a sus usuarios y a una cuenta exclusiva del sincronizador. Asignar únicamente a esa cuenta `app_metadata.rmh_publisher = true` (booleano). Renovar la sesión tras cambiar la asignación.
2. El administrador de RMH debe mapear el catálogo autorizado a la vista `dbo.VigiaCatalog`. Debe devolver un registro por código, con `barcode` de texto (conservar ceros iniciales), `name` de texto, `price` como precio final al consumidor en córdobas y `stock` como existencia de esa tienda. Precio y existencia admiten NULL. Conceder SELECT sobre la vista a la identidad del sincronizador.
3. Configurar para esa identidad las variables `RMH_CONNECTION` (cadena SQL, preferiblemente autenticación integrada y cifrado con certificado válido), `VIGIA_URL`, `VIGIA_PUBLIC_KEY`, `VIGIA_SYNC_EMAIL` y `VIGIA_SYNC_PASSWORD`. Mantener las credenciales en la estación autorizada.
4. Ejecutar el script y revisar el total publicado. Para actualizaciones periódicas, usar el Programador de tareas de Windows con la frecuencia de la tienda y evitar ejecuciones superpuestas.
5. En Vigía abrir **Menú → Mi tienda**, actualizar y contrastar un código, precio y existencia conocidos con RMH. Después de descargar, los datos quedan disponibles en ese navegador para la misma cuenta y tienda.

## Consulta en vivo desde Mi tienda

El teléfono envía cada búsqueda por HTTPS a una estación de la sucursal. El servicio valida la sesión de Vigía con Supabase, comprueba que la tienda asignada coincida y lee exclusivamente los cuatro campos de la vista anterior. El acceso a Internet de la estación se utiliza para validar la sesión. Esta modalidad funciona independientemente del publicador de instantáneas.

1. Preparar la vista de lectura y la asignación de tienda indicadas arriba. Asignar en Supabase el booleano administrado `app_metadata.rmh_live_read = true` a cada cuenta habilitada. La cuenta de consulta de Vigía debe tener permiso para ver esos mismos campos y artículos. Si hay perfiles con distintos alcances dentro de una misma sucursal, habilitar esta modalidad solo para el grupo con acceso al catálogo completo de la vista.
2. En la estación instalar Python 3.11 o posterior, Microsoft ODBC Driver 18 for SQL Server y las dependencias con `py -m pip install -r scripts/rmh/requirements.txt`.
3. Configurar `RMH_ODBC_CONNECTION` como cadena ODBC de la identidad de solo lectura, `RMH_STORE_ID` como identificador de sucursal, `VIGIA_ORIGIN` como origen HTTPS exacto de la web y `VIGIA_URL` y `VIGIA_PUBLIC_KEY` como URL y clave pública del proyecto Supabase. La cadena ODBC permanece en la estación.
4. Asignar al servicio un nombre DNS que resuelva dentro del Wi-Fi y un certificado HTTPS de confianza para los teléfonos. Desde la raíz del proyecto iniciar el servicio sustituyendo dirección, puerto y rutas por los de la estación:
   ```powershell
   py -m uvicorn live:create_app --factory --app-dir scripts/rmh --host <IP-LAN> --port 8443 --ssl-certfile <certificado.pem> --ssl-keyfile <clave.pem>
   ```
   Limitar el acceso al puerto a la red de tienda. Para varias sucursales se puede resolver el mismo nombre al servicio local de cada una.
5. En el despliegue web configurar `VITE_RMH_LAN_ORIGIN` con el origen HTTPS del servicio, incluido su puerto, y recompilar. En el teléfono abrir **Mi tienda → En vivo por Wi-Fi** y permitir el acceso a la red local si el navegador lo solicita. Buscar por nombre y comprobar un código conocido contra RMH. La pantalla muestra la hora de cada consulta. El catálogo guardado sigue disponible por separado.
