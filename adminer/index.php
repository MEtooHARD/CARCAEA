<?php
function adminer_object() {
    require 'plugins/plugin.php';

    foreach (glob('plugins-enabled/*.php') as $file) {
        require_once $file;
    }

    return new AdminerPlugin([new AdminerReadOnly()]);
}

require 'adminer.php';
