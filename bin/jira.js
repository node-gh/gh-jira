#!/usr/bin/env node

/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Author <email@email.com>
 */

var GH_PATH = process.env.GH_PATH;

// -- Requires -----------------------------------------------------------------
var async = require('async'),
    jira = require('jira'),
    url = require('url'),
    base = require(GH_PATH + 'lib/base'),
    logger = require(GH_PATH + 'lib/logger');

// -- Constructor --------------------------------------------------------------

function Jira(options) {
    this.options = options;
}

// -- Constants ----------------------------------------------------------------
Jira.DETAILS = {
    alias: 'ji',
    commands: [
        'foo'
    ],
    description: 'NodeGH plugin for integrating Jira, an issue management system.',
    options: {
        'foo': Boolean
    },
    shorthands: {
        'f': [ '--foo' ]
    },
    payload: function(payload, options) {
        options.foo = true;
    }
};

// -- Commands -----------------------------------------------------------------
Jira.prototype.run = function() {
    var instance = this,
        options = instance.options;

    if (options.foo) {
        logger.log(instance.foo());
    }
};

Boilerplate.prototype.foo = function() {
    return 'NodeGH plugin boilerplate :)';
};

exports.Impl = Jira;