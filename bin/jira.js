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
    prompt = require('prompt'),
    openUrl = require('open'),
    base = require(GH_PATH + 'lib/base'),
    git = require(GH_PATH + 'lib/git'),
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
        'browser',
        'comment',
        'new',
        'transition'
    ],
    description: 'NodeGH plugin for integrating Jira, an issue management system.',
    options: {
        'assignee': String,
        'browser': Boolean,
        'comment': String,
        'component': String,
        'message': String,
        'new': Boolean,
        'number': [String, Array],
        'priority': String,
        'project': String,
        'reporter': String,
        'resolution': String,
        'title': String,
        'transition': String,
        'type': String,
        'update': Boolean,
        'version': String
    },
    shorthands: {
        'A': ['--assignee'],
        'B': ['--browser'],
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
        'u': ['--update'],
        'v': ['--version']
    }
};

// -- Commands -----------------------------------------------------------------
Jira.prototype.api = null;

Jira.prototype.run = function() {
    var instance = this,
        config = base.getPluginConfig().plugins,
        options = instance.options;

    instance.api = new jira.JiraApi(
        config.jira.protocol, config.jira.host, config.jira.port,
        config.jira.user, config.jira.password, config.jira.api_version);

    instance.registerLoggerHelpers_();

    options.originalAssignee = options.assignee;
    options.assignee = options.assignee || config.jira.user;
    options.project = options.project || config.jira.default_project;
    options.reporter = options.reporter || config.jira.user;
    options.type = options.type || config.jira.default_issue_type;
    options.component = options.component || config.jira.default_issue_component[options.project];
    options.version = options.version || config.jira.default_issue_version[options.project];

    if (options.browser) {
        if (options.number) {
            instance.browser(options.number);
        }
        else {
            instance.getIssueNumberFromCommitMessage_(function(err, data) {
                if (!data) {
                    logger.defaultCallback('Could not find issue number, try with --number.');
                }
                instance.browser(data);
            });
        }
    }

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

    if (options.transition) {
        if (options.transition === 'true') {
            logger.logTemplate(
                '{{prefix}} [info] Listing available transitions for {{greenBright options.number}}', {
                    options: options
                });

            instance.transitionWithQuestion_(options.number, options.transition, function(err) {
                logger.defaultCallback(
                    err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                        options: options
                    }));
            });
        }
        else {
            logger.logTemplate(
                '{{prefix}} [info] Updating issue {{greenBright options.number}} to {{magentaBright options.transition}}', {
                    options: options
                });

            instance.transition(options.number, options.transition, function(err) {
                logger.defaultCallback(
                    err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                        options: options
                    }));
            });
        }
    }

    if (options.update) {
        logger.logTemplate(
            '{{prefix}} [info] Updating issue {{greenBright options.number}}', {
                options: options
            });

        instance.update(options.number, function(err) {
            logger.defaultCallback(
                err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                    options: options
                }));
        });
    }
};

Jira.prototype.browser = function(number) {
    var instance = this;

    openUrl(instance.getIssueUrl_(number));
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

Jira.prototype.compileObjectValuesTemplate_ = function(o) {
    var instance = this,
        options = instance.options,
        config = base.getPluginConfig().plugin;

    Object.keys(o).forEach(function(key) {
        var value = o[key];

        if (typeof value === 'object') {
            instance.compileObjectValuesTemplate_(value);
        }
        else {
            o[key] = logger.compileTemplate(value, {
                jira: config.jira,
                options: options
            });
        }
    });
};

Jira.prototype.deleteObjectEmptyValues_ = function(o) {
    var instance = this;

    Object.keys(o).forEach(function(key) {
        var value = o[key];

        if (typeof value === 'object') {
            instance.deleteObjectEmptyValues_(value);
        }
        else if (value === undefined || value === '') {
            delete o[key];
        }
    });
};

Jira.prototype.expandComment_ = function(comment) {
    var instance = this,
        config = base.getPluginConfig();

    return '{markdown}' + comment + instance.expandEmoji_(config.signature) + '{markdown}';
};

Jira.prototype.expandEmoji_ = function(content) {
    return content.replace(':octocat:', '![NodeGH](http://nodegh.io/images/octocat.png)');
};

Jira.prototype.expandTransitionPayloadFromConfig_ = function(transitionName, payload, opt_callback) {
    var instance = this,
        config = base.getPluginConfig().plugins,
        transition = config.jira.transition[transitionName],
        field,
        fields,
        operations;

    if (transition) {
        operations = [
            function(callback) {
                instance.getFields_(function(err, data) {
                    if (!err) {
                        fields = data;
                    }
                    callback(err);
                });
            },
            function(callback) {
                Object.keys(transition).forEach(function(fieldName) {
                    var fieldValue = transition[fieldName];

                    if (fieldValue) {
                        // Get field by name using fields cache to avoid
                        // unecesary server roundtrip.
                        instance.getFieldByName_(fieldName, function(err, data) {
                            if (!err) {
                                field = data;
                            }
                        }, fields);

                        if (field) {
                            payload.fields[field.id] = fieldValue;
                        }
                    }
                });

                instance.compileObjectValuesTemplate_(payload);

                callback();
            }
        ];

        async.series(operations, function(err) {
            opt_callback && opt_callback(err, payload);
        });
    }
    else {
        opt_callback && opt_callback(null, payload);
    }
};

Jira.prototype.findFirstArrayValue_ = function(values, key, search) {
    var value;

    values.every(function(val) {
        if (val[key] === search) {
            value = val;
            return false;
        }
        return true;
    });

    return value;
};

Jira.prototype.getIssueNumberBestMatch_ = function(text) {
    var config = base.getPluginConfig().plugins,
        project = config.jira.default_project,
        match,
        numberRegex;

    if (project) {
        numberRegex = new RegExp(project + '-[0-9]+');

        if (match = text.match(numberRegex)) {
            return match[0];
        }
    }
};

Jira.prototype.getIssueNumberFromCommitMessage_ = function(opt_callback) {
    var instance = this;

    git.getLastCommitMessage(null, function(err, data) {
        data = instance.getIssueNumberBestMatch_(data);
        opt_callback && opt_callback(err, data);
    });
};

Jira.prototype.getFields_ = function(opt_callback) {
    var instance = this;

    instance.api.listFields(function(err, components) {
        opt_callback && opt_callback(err, components);
    });
};

Jira.prototype.getFieldByName_ = function(name, opt_callback, opt_source) {
    var instance = this,
        operations,
        fields,
        field;

    operations = [
        function(callback) {
            // If opt_source is specified use it instead of invoke jira API.
            if (opt_source) {
                fields = opt_source;
                callback();
                return;
            }

            instance.getFields_(function(err, data) {
                if (!err) {
                    fields = data;
                }
                callback(err);
            });
        },
        function(callback) {
            field = instance.findFirstArrayValue_(fields, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, field);
    });
};

Jira.prototype.getIssue_ = function(issueNumber, opt_callback) {
    var instance = this;

    instance.api.findIssue(issueNumber, function(err, issue) {
        opt_callback && opt_callback(err, issue);
    });
};

Jira.prototype.getIssueTypeByName_ = function(name, opt_callback) {
    var instance = this,
        issueType,
        operations,
        types;

    operations = [
        function(callback) {
            instance.getIssueTypes_(function(err, data) {
                if (!err) {
                    types = data;
                }
                callback(err);
            });
        },
        function(callback) {
            issueType = instance.findFirstArrayValue_(types, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, issueType);
    });
};

Jira.prototype.getIssueTypes_ = function(opt_callback) {
    var instance = this;

    instance.api.listIssueTypes(function(err, types) {
        opt_callback && opt_callback(err, types);
    });
};

Jira.prototype.getIssueUrl_ = function(number) {
    var config = base.getPluginConfig().plugins;

    return url.format({
        protocol: config.jira.protocol,
        hostname: config.jira.host,
        port: config.jira.port,
        pathname: '/browse/' + number
    });
};

Jira.prototype.getUpdatePayload_ = function(opt_callback) {
    var instance = this,
        options = instance.options,
        component,
        issueType,
        operations,
        payload,
        priority,
        project,
        version;

    if (options.message) {
        options.message = logger.applyReplacements(options.message);
    }

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
                    err = 'No priority found, try --priority "Minor".';
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

            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, payload);
    });
};

Jira.prototype.getPriorities_ = function(opt_callback) {
    var instance = this;

    instance.api.listPriorities(function(err, components) {
        opt_callback && opt_callback(err, components);
    });
};

Jira.prototype.getPriorityByName_ = function(name, opt_callback) {
    var instance = this,
        operations,
        priorities,
        priority;

    operations = [
        function(callback) {
            instance.getPriorities_(function(err, data) {
                if (!err) {
                    priorities = data;
                }
                callback(err);
            });
        },
        function(callback) {
            priority = instance.findFirstArrayValue_(priorities, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, priority);
    });
};

Jira.prototype.getProject_ = function(name, opt_callback) {
    var instance = this;

    instance.api.getProject(name, function(err, project) {
        opt_callback && opt_callback(err, project);
    });
};

Jira.prototype.getProjectComponentByName_ = function(project, name, opt_callback) {
    var instance = this,
        component,
        components,
        operations;

    operations = [
        function(callback) {
            instance.getProjectComponents_(project, function(err, data) {
                if (!err) {
                    components = data;
                }
                callback(err);
            });
        },
        function(callback) {
            component = instance.findFirstArrayValue_(components, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, component);
    });
};

Jira.prototype.getProjectComponents_ = function(project, opt_callback) {
    var instance = this;

    instance.api.listComponents(project, function(err, components) {
        opt_callback && opt_callback(err, components);
    });
};

Jira.prototype.getTransitions_ = function(number, opt_callback) {
    var instance = this;

    instance.api.listTransitions(number, function(err, transitions) {
        opt_callback && opt_callback(err, transitions);
    });
};

Jira.prototype.getTransitionByName_ = function(number, name, opt_callback) {
    var instance = this,
        operations,
        transition,
        transitions;

    operations = [
        function(callback) {
            instance.getTransitions_(number, function(err, data) {
                if (!err) {
                    transitions = data;
                }
                callback(err);
            });
        },
        function(callback) {
            transition = instance.findFirstArrayValue_(transitions, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, transition);
    });
};

Jira.prototype.getVersionByName_ = function(project, name, opt_callback) {
    var instance = this,
        operations,
        version,
        versions;

    operations = [
        function(callback) {
            instance.getVersions_(project, function(err, data) {
                if (!err) {
                    versions = data;
                }
                callback(err);
            });
        },
        function(callback) {
            version = instance.findFirstArrayValue_(versions, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, version);
    });
};

Jira.prototype.getVersions_ = function(project, opt_callback) {
    var instance = this;

    instance.api.getVersions(project, function(err, types) {
        opt_callback && opt_callback(err, types);
    });
};

Jira.prototype.new = function(opt_callback) {
    var instance = this,
        issue,
        operations,
        payload;

    operations = [
        function(callback) {
            instance.getUpdatePayload_(function(err, data) {
                if (!err) {
                    payload = data;
                }
                callback(err);
            });
        },
        function(callback) {
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
        options = instance.options;

    logger.registerHelper('jiraIssueLink', function() {
        return instance.getIssueUrl_(options.number);
    });
};

Jira.prototype.searchUser_ = function(query, opt_callback) {
    var instance = this;

    instance.api.searchUsers(query, 0, 1, true, false, opt_callback);
};

Jira.prototype.searchUserByGithubUsername_ = function(query, opt_callback) {
    var instance = this,
        operations,
        user,
        userGithub;

    operations = [
        function(callback) {
            instance.searchUser_(query, function(err, data) {
                if (!err && data.length) {
                    user = data[0];
                }
                callback(err);
            });
        },
        function(callback) {
            // If user was found on jira do not call github search.
            if (user) {
                callback();
                return;
            }

            var payload = {
                keyword: query
            };

            base.github.search.users(payload, function(err, data) {
                if (!err) {
                    userGithub = data.users[0];
                }
                callback(err);
            });
        },
        function(callback) {
            instance.searchUser_(userGithub.name, function(err, data) {
                if (!err && data.length) {
                    user = data[0];
                }
                callback(err);
            });
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, user);
    });
};

Jira.prototype.transition = function(number, name, opt_callback) {
    var instance = this,
        options = instance.options,
        issue,
        newIssue,
        operations,
        payload,
        expandedPayload,
        transition;

    options.message = options.message || '';

    operations = [
        function(callback) {
            instance.getTransitionByName_(number, name, function(err, data) {
                if (!err) {
                    transition = data;
                }
                if (!transition) {
                    err = '"' + name + '" is not a valid transition, try another action.';
                }
                callback(err);
            });
        },
        function(callback) {
            instance.getIssue_(number, function(err, data) {
                if (!err) {
                    issue = data;
                }
                callback(err);
            });
        },
        function(callback) {
            payload = {
                update: {},
                fields: {},
                transition: {
                    id: transition.id
                }
            };

            instance.expandTransitionPayloadFromConfig_(name, payload, function(err, data) {
                if (!err) {
                    expandedPayload = data;
                }
                callback(err);
            });
        },
        function(callback) {
            if (options.originalAssignee) {
                payload.fields.assignee = {
                    name: options.assignee
                };
            }

            if (options.message) {
                options.message = instance.expandComment_(
                    logger.applyReplacements(options.message));

                payload.update.comment = [
                    {
                        add: {
                            body: options.message
                        }
                    }
                ];
            }

            if (options.resolution) {
                payload.fields.resolution = {
                    name: options.resolution
                };
            }

            callback();
        },
        function(callback) {
            instance.api.transitionIssue(issue.id, expandedPayload, function(err, data) {
                if (!err) {
                    newIssue = data;
                }
                callback(err);
            });
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, newIssue);
    });
};

Jira.prototype.transitionWithQuestion_ = function(number, name, opt_callback) {
    var instance = this,
        options = instance.options,
        transitionIndex,
        transition,
        transitionName,
        transitions,
        operations;

    operations = [
        function(callback) {
            instance.api.listTransitions(number, function(err, data) {
                if (!err) {
                    transitions = data;
                }
                callback(err);
            });
        },
        function(callback) {
            logger.logTemplateFile(__dirname + '/transitions.handlebars', {
                options: options,
                transitions: transitions
            });

            prompt.get([
                    {
                        name: 'transitionIndex',
                        message: 'Type the number of the transition [0 - ' + (transitions.length - 1) + ']',
                        empty: false
                    }
                ],
                function(err, result) {
                    if (!err) {
                        transitionIndex = result.transitionIndex;
                    }
                    callback(err);
                });
        },
        function(callback) {
            transitionName = transitions[transitionIndex].name;

            logger.logTemplate(
                '{{prefix}} [info] Updating issue {{greenBright options.number}} to {{magentaBright transitionName}}', {
                    options: options,
                    transitionName: transitionName
                });

            instance.transition(number, transitionName, function(err, data) {
                if (!err) {
                    transition = data;
                }
                callback(err);
            });
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, transition);
    });
};

Jira.prototype.update = function(number, opt_callback) {
    var instance = this,
        issue,
        operations,
        payload;

    operations = [
        function(callback) {
            instance.getUpdatePayload_(function(err, data) {
                if (!err) {
                    payload = data;
                }
                callback(err);
            });
        },
        function(callback) {
            instance.deleteObjectEmptyValues_(payload);
            callback();
        },
        function(callback) {
            instance.api.updateIssue(number, payload, function(err, data) {
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

exports.Impl = Jira;