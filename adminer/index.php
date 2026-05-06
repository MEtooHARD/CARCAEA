<?php
// Adminer bootstrap with read-only plugin
function adminer_object() {
    foreach (glob('plugins-enabled/*.php') as $file) {
        require_once $file;
    }

    class AdminerCustom extends Adminer {
        function name() { return 'CARCAEA DB Viewer'; }
    }

    return new AdminerPlugin([new AdminerReadOnly()]);
}

require 'adminer.php';
