#!/usr/bin/env node

/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Eduardo Lundgren <eduardolundgren@gmail.com>
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
    iterative: 'number',
    commands: [
        'comment'
    ],
    description: 'NodeGH plugin for integrating Jira, an issue management system.',
    options: {
        'comment': String,
        'number': [String, Array]
    },
    shorthands: {
        'c': ['--comment'],
        'n': ['--number']
    }
};

// -- Commands -----------------------------------------------------------------
Jira.prototype.api = null;

Jira.prototype.run = function() {
    var instance = this,
        config = base.getGlobalConfig(),
        options = instance.options;

    instance.api = new jira.JiraApi(
        config.jira.protocol, config.jira.host, config.jira.port,
        config.jira.user, config.jira.password, config.jira.api_version);

    instance.registerLoggerHelpers_();

    if (options.comment) {
        logger.logTemplate(
            '{{prefix}} [info] Adding comment on issue {{greenBright "#" options.number}}', {
                options: options
            });

        instance.comment(function(err) {
            logger.defaultCallback(
                err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                    options: options
                }));
        });
    }
};

Jira.prototype.comment = function(opt_callback) {
    var instance = this,
        config = base.getGlobalConfig(),
        options = instance.options,
        issue,
        operations;

    operations = [
        function(callback) {
            instance.getIssue_(options.number, function(err, data) {
                if (!err) {
                    issue = data;
                }
                callback(err);
            });
        },
        function(callback) {
            options.comment = '{markdown}' +
                logger.applyReplacements(options.comment) +
                instance.expandEmoji_(config.signature) + '{markdown}';

            instance.api.addComment(issue.id, options.comment, callback);
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err);
    });
};

Jira.prototype.expandEmoji_ = function(content) {
    return content.replace(':octocat:', '![NodeGH](http://nodegh.io/images/octocat.png)');
};

Jira.prototype.getIssue_ = function(issueNumber, opt_callback) {
    var instance = this;

    instance.api.findIssue(issueNumber, function(err, issue) {
        opt_callback && opt_callback(err, issue);
    });
};

Jira.prototype.registerLoggerHelpers_ = function() {
    var instance = this,
        options = instance.options,
        config = base.getGlobalConfig();

    logger.registerHelper('jiraIssueLink', function() {
        var link = url.format({
            protocol: config.jira.protocol,
            hostname: config.jira.host,
            port: config.jira.port,
            pathname: '/browse/' + options.number
        });

        return link;
    });
};

exports.Impl = Jira;