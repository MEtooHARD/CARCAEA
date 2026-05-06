FROM adminer:latest

# Download the read-only plugin
ADD https://raw.githubusercontent.com/vrana/adminer/master/plugins/read-only.php /var/www/html/plugins-enabled/read-only.php

# Entrypoint wrapper that loads plugins
COPY index.php /var/www/html/index.php
