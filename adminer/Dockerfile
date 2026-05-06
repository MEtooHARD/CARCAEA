FROM adminer:4

# Download plugin loader (v4 path) and fix permissions
ADD https://raw.githubusercontent.com/vrana/adminer/v4.8.1/plugins/plugin.php /var/www/html/plugins/plugin.php
RUN chmod 644 /var/www/html/plugins/plugin.php

# Copy read-only plugin and custom index
COPY read-only.php /var/www/html/plugins-enabled/read-only.php
COPY index.php /var/www/html/index.php
