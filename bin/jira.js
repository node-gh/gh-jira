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
        'comment',
        'new'
    ],
    description: 'NodeGH plugin for integrating Jira, an issue management system.',
    options: {
        'assignee': String,
        'comment': String,
        'component': String,
        'message': String,
        'new': Boolean,
        'number': [String, Array],
        'priority': String,
        'project': String,
        'reporter': String,
        'title': String,
        'type': String,
        'version': String
    },
    shorthands: {
        'A': ['--assignee'],
        'c': ['--comment'],
        'C': ['--component'],
        'm': ['--message'],
        'N': ['--new'],
        'n': ['--number'],
        'p': ['--project'],
        'P': ['--priority'],
        'R': ['--reporter'],
        'T': ['--type'],
        't': ['--title'],
        'v': ['--version']
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

    if (options.new) {
        logger.logTemplate(
            '{{prefix}} [info] Creating a new issue on project {{greenBright options.project}}', {
                options: options
            });

        instance.new(function(err, issue) {
            if (issue) {
                options.number = issue.key;
            }

            logger.defaultCallback(
                err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                    options: options
                }));
        });
    }
};

Jira.prototype.comment = function(opt_callback) {
    var instance = this,
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
            options.comment = instance.expandComment_(
                logger.applyReplacements(options.comment));

            instance.api.addComment(issue.id, options.comment, callback);
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err);
    });
};

Jira.prototype.expandComment_ = function(comment) {
    var instance = this,
        config = base.getGlobalConfig();

    return '{markdown}' + comment + instance.expandEmoji_(config.signature) + '{markdown}';
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

Jira.prototype.new = function(opt_callback) {
    var instance = this,
        options = instance.options,
        config = base.getGlobalConfig(),
        component,
        issue,
        issueType,
        operations,
        payload,
        priority,
        project,
        version;

    if (options.message) {
        options.message = logger.applyReplacements(options.message);
    }

    options.assignee = options.assignee || config.jira.user;
    options.reporter = options.reporter || config.jira.user;
    options.message = options.message || '';
    options.title = options.title || '';

    operations = [
        function(callback) {
            instance.getIssueTypeByName_(options.type, function(err, data) {
                if (!err) {
                    issueType = data;
                }
                if (!issueType) {
                    err = 'No issue found, try --type "Bug".';
                }
                callback(err);
            });
        },
        function(callback) {
            instance.getProject_(options.project, function(err, data) {
                if (!err) {
                    project = data;
                }
                callback(err);
            });
        },
        function(callback) {
            instance.getProjectComponentByName_(options.project, options.component, function(err, data) {
                if (!err) {
                    component = data;
                }
                if (!component) {
                    err = 'No component found, try --component "JavaScript".';
                }
                callback(err);
            });
        },
        function(callback) {
            // Since priority is not required in many JIRA configurations, skip
            // it if not specified.
            if (!options.priority) {
                callback();
                return;
            }

            instance.getPriorityByName_(options.priority, function(err, data) {
                if (!err) {
                    priority = data;
                }
                if (!priority) {
                    err = 'No priority found, try --priority "JavaScript".';
                }
                callback(err);
            });
        },
        function(callback) {
            // Since version is not required in many JIRA configurations, skip
            // it if not specified.
            if (!options.version) {
                callback();
                return;
            }

            instance.getVersionByName_(options.project, options.version, function(err, data) {
                if (!err) {
                    version = data;
                }
                if (!version) {
                    err = 'No version found, try --version "0.1.0".';
                }
                callback(err);
            });
        },
        function(callback) {
            payload = {
                fields: {
                    assignee: {
                        name: options.assignee
                    },
                    components: [
                        {
                            id: component.id
                        }
                    ],
                    description: options.message,
                    issuetype: {
                        id: issueType.id
                    },
                    project: {
                        id: project.id
                    },
                    reporter: {
                        name: options.reporter
                    },
                    summary: options.title
                }
            };

            if (priority) {
                payload.fields.priority = {
                    id: priority.id
                };
            }

            if (version) {
                payload.fields.versions = [
                    {
                        id: version.id
                    }
                ];
            }

            instance.api.addNewIssue(payload, function(err, data) {
                if (!err) {
                    issue = data;
                }
                callback(err);
            });
        }
    ];

    async.series(operations, function(err) {
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