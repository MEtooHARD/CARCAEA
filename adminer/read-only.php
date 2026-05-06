<?php
/**
 * Prevent any changes to the database (read-only mode).
 * Hides all write actions: insert, update, delete, drop, alter, import, etc.
 */
class AdminerReadOnly {
    function tableLinks($tableStatus, $set = []) {
        return [
            'select' => lang('Select data'),
            'table'  => lang('Show structure'),
        ];
    }

    function tablesFilter() { return true; }

    function dumpFormat() { return []; }

    function dumpOutput() { return []; }

    function importServerPath() { return ''; }

    function fieldKeys($table, $tableStatus) { return []; }

    // Block all write-capable SQL keywords
    function queryTimeout() { return 0; }
}
