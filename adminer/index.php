<?php
function adminer_object() {
    class AdminerReadOnly extends Adminer {
        function name() { return 'CARCAEA DB Viewer'; }

        // Hide insert / edit / delete links
        function editRowPrint($table, $fields, $row, $delete) {}
        function selectLinks($tableStatus, $set = []) {
            return ['select' => lang('Select data'), 'table' => lang('Show structure')];
        }

        // Disable import
        function importServerPath() { return ''; }

        // Disable dump options
        function dumpFormat() { return []; }
        function dumpOutput() { return []; }
    }

    return new AdminerReadOnly();
}

require 'adminer.php';
