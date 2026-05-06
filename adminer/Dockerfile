FROM adminer:latest

# Copy the read-only plugin from local context
COPY read-only.php /var/www/html/plugins-enabled/read-only.php

# Entrypoint wrapper that loads plugins
COPY index.php /var/www/html/index.php
