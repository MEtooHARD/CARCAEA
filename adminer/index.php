<?php
function adminer_object() {
    class AdminerReadOnly {
        function name() { return 'CARCAEA DB Viewer'; }
        function editRowPrint($table, $fields, $row, $delete) {}
        function selectLinks($tableStatus, $set = []) {
            return ['select' => 'Select data', 'table' => 'Show structure'];
        }
        function importServerPath() { return ''; }
        function dumpFormat() { return []; }
        function dumpOutput() { return []; }
    }
    return new AdminerReadOnly();
}

require 'adminer.php';
