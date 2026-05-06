<?php
// Adminer bootstrap with read-only plugin
function adminer_object() {
    require 'plugins/plugin.php';

    foreach (glob('plugins-enabled/*.php') as $file) {
        require_once $file;
    }

    class AdminerCustom extends AdminerPlugin {
        function name() { return 'CARCAEA DB Viewer'; }
    }

    return new AdminerCustom([new AdminerReadOnly()]);
}

require 'adminer.php';
