#!/usr/bin/env node

/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Eduardo Lundgren <edu@rdo.io>
 */

var GH_PATH = process.env.GH_PATH;

// -- Requires -----------------------------------------------------------------
var async = require('async'),
    base = require(GH_PATH + 'lib/base'),
    crypto = require('crypto'),
    git = require(GH_PATH + 'lib/git'),
    inquirer = require('inquirer'),
    jira = require('jira'),
    logger = require(GH_PATH + 'lib/logger'),
    openUrl = require('open'),
    url = require('url'),
    config = base.getConfig(true),
    jiraConfig = config.plugins.jira;

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
        'transition',
        'update'
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
        'submittedLink': String,
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
        'P': ['--priority'],
        'p': ['--project'],
        'R': ['--reporter'],
        't': ['--title'],
        'T': ['--type'],
        'u': ['--update'],
        'v': ['--version']
    },
    payload: function(payload, options) {
        options.transition = payload[1] || true;
    }
};

Jira.ACTION_ISSUE_ASSIGN = 'ISSUE_ASSIGN';

Jira.ACTION_ISSUE_OPEN_IN_BROWSER = 'ISSUE_OPEN_IN_BROWSER';

Jira.CRYPTO_ALGORITHM = 'AES-256-CBC';

Jira.CRYPTO_PASSWORD = 'nodegh.io';

Jira.getIssueNumber = function(opt_branch, opt_callback) {
    var number,
        project,
        operations;

    operations = [
        function(callback) {
            // First, try to extract the issue number from the optional branch
            // name.
            if (opt_branch) {
                number = Jira.getIssueNumberFromText(opt_branch);
            }

            if (number) {
                callback();
            }
            else {
                // If number was not found, try to extract from the current
                // branch name.
                git.getCurrentBranch(function(err, data) {
                    number = Jira.getIssueNumberFromText(data);
                    callback();
                });
            }
        },
        function(callback) {
            if (number) {
                callback();
                return;
            }

            // If number was not found yet, use only the first commit message to
            // infer the issue number. Use more than one message, can,
            // potentially, guess a wrong issue number.
            git.getCommitMessage(opt_branch, 1, function(err, data) {
                number = Jira.getIssueNumberFromText(data);
                callback();
            });
        },
        function(callback) {
            // Try to extract the project name from the found number.
            if (number) {
                project = Jira.getProjectName(number);
            }
            callback();
        },
        function(callback) {
            if (project) {
                callback();
                return;
            }
            // If project was not found yet, use the last five commit messagesto infer the project name.
            git.getCommitMessage(opt_branch, 5, function(err, data) {
                project = Jira.getProjectName(Jira.getIssueNumberFromText(data));
                callback();
            });
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, number, project);
    });
};

Jira.getIssueNumberFromText = function(text) {
    var match;

    // Try uppercase sequence first, e.g. FOO-123.
    // If not found, try case-insensitive sequence, e.g. foo-123.
    match = text.match(/[A-Z]{3,}-\d+/) || text.match(/[a-z]{3,}-\d+/i);

    if (match) {
        return match[0].toUpperCase();
    }
};

Jira.getProjectName = function(number) {
    if (number) {
        return number.substring(0, number.indexOf('-'));
    }
};


// Hooks -----------------------------------------------------------------------

exports.setupAfterHooks = function(context, done) {
    var options = context.options;

    Jira.getIssueNumber(options.pullBranch, function(err, number) {
        context.jira = jiraConfig;

        if (!context.jira.number) {
            context.jira.number = {};
        }

        context.jira.number.current = number;

        done();
    });
};

exports.setupBeforeHooks = function(context, done) {
    var options = context.options;

    Jira.getIssueNumber(options.pullBranch, function(err, number) {
        context.jira = jiraConfig;

        if (!context.jira.number) {
            context.jira.number = {};
        }

        context.jira.number.previous = number;

        done();
    });
};

// -- Commands -----------------------------------------------------------------
Jira.prototype.api = null;

Jira.prototype.run = function() {
    var instance = this,
        options = instance.options,
        operations;

    instance.expandAliases_(options);

    instance.registerLoggerHelpers_();

    options.originalAssignee = options.assignee;
    options.assignee = options.assignee || jiraConfig.user;
    options.reporter = options.reporter || jiraConfig.user;

    operations = [
        function(callback) {
            // Some users may have unencrypted passwords, forces login to store
            // it encrypted.
            try {
                jiraConfig.password = instance.decryptText_(jiraConfig.password);
            }
            catch(e) {
                jiraConfig.password = null;
            }
            callback();
        },
        function(callback) {
            if (jiraConfig.user && jiraConfig.password) {
                callback();
            }
            else {
                instance.login_(function() {
                    logger.success('Writing GH config data: ' + base.getUserHomePath());
                });
            }
        },
        function(callback) {
            instance.api = new jira.JiraApi(
                jiraConfig.protocol, jiraConfig.host, jiraConfig.port,
                jiraConfig.user, jiraConfig.password, jiraConfig.api_version);

            callback();
        },
        function(callback) {
            Jira.getIssueNumber(null, function(err, number, project) {
                options.number = options.number || number;
                options.project = options.project || project;
                callback(err);
            });
        },
        function(callback) {
            options.component = options.component || jiraConfig.default_issue_component[options.project];
            options.type = options.type || jiraConfig.default_issue_type[options.project];
            options.version = options.version || jiraConfig.default_issue_version[options.project];
            callback();
        },
        function(callback) {
            // If the assignee was not specified on the command options or there
            // is no issue number no need for search the user.
            if (!options.originalAssignee || !options.number) {
                callback();
                return;
            }

            instance.searchUserByGithubUsername_(options.assignee, function(err, users) {
                if (err) {
                    callback(err);
                    return;
                }

                if (!users) {
                    callback('Not found any user for ' + options.assignee);
                    return;
                }

                if (users.length > 1) {
                    instance.selectUserWithQuestion_(users, function(username) {
                        options.assignee = username;
                        callback();
                    });
                }
                else {
                    options.assignee = users[0].name;
                    callback();
                }
            });
        }
    ];

    async.series(operations, function() {
        if (options.browser) {
            instance.browser(options.number);
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
            if (options.project) {
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
            else {
                logger.warn('Project name not found, try with --project.');
            }
        }

        if (options.transition) {
            if (options.number) {
                if (String(options.transition) === 'true') {
                    instance.transitionWithQuestion_(
                        options.number, options.transition, function(err, data) {
                            if (err || data) {
                                logger.defaultCallback(
                                    err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                                        options: options
                                    }));
                            }
                        });
                }
                else {
                    logger.logTemplate(
                        '{{prefix}} [info] Updating issue {{greenBright options.number}} to {{cyan options.transition}}', {
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
            else {
                logger.warn('Skipping JIRA transition, issue number not specified.');
            }
        }

        if (options.update) {
            if (options.project) {
                logger.logTemplate(
                    '{{prefix}} [info] Updating issue {{cyan options.number}}', {
                        options: options
                    });

                instance.update(options.number, function(err) {
                    logger.defaultCallback(
                        err, null, logger.compileTemplate('{{jiraIssueLink}}', {
                            options: options
                        }));
                });
            }
            else {
                logger.warn('Project name not found, try --project JIR.');
            }
        }
    });
};

Jira.prototype.addTransitionFieldsArray_ = function(transition) {
    var fields,
        fieldsArray;

    if (transition) {
        fields = transition.fields;

        fieldsArray = [];
        Object.keys(fields).forEach(function(fieldId) {
            fields[fieldId].id = fieldId;
            fieldsArray.push(fields[fieldId]);
        });
        transition.fieldsArray = fieldsArray;
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
        value;

    value = JSON.stringify(o);
    value = logger.compileTemplate(value, {
        jira: jiraConfig,
        options: options
    });

    return JSON.parse(value);
};

Jira.prototype.decryptText_ = function(text) {
    var decipher,
        decrypted;

        decipher = crypto.createDecipher(
            Jira.CRYPTO_ALGORITHM, Jira.CRYPTO_PASSWORD);

        decrypted = decipher.update(text, 'hex', 'utf8');

    decrypted += decipher.final('utf8');

    return decrypted;
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

Jira.prototype.encryptText_ = function(text) {
    var cipher,
        crypted;

        cipher = crypto.createCipher(
            Jira.CRYPTO_ALGORITHM, Jira.CRYPTO_PASSWORD);

        crypted = cipher.update(text, 'utf8', 'hex');

    crypted += cipher.final('hex');

    return crypted;
};

Jira.prototype.expandAliases_ = function(options) {
    if (config.alias) {
        options.assignee = config.alias[options.assignee] || options.assignee;
        options.reporter = config.alias[options.reporter] || options.reporter;
    }
};

Jira.prototype.expandComment_ = function(comment) {
    var instance = this;

    return '{markdown}' + comment + instance.expandEmoji_(config.signature) + '{markdown}';
};

Jira.prototype.expandEmoji_ = function(content) {
    return content.replace(':octocat:', '![NodeGH](http://nodegh.io/images/octocat.png)');
};

Jira.prototype.expandTransitionFields_ = function(transitionConfig, transition, payload, opt_callback) {
    var instance = this,
        operations = [];

    transition.fieldsArray.forEach(function(field) {
        var configValue = transitionConfig && transitionConfig[field.name];

        if (configValue !== undefined && configValue !== true) {
            payload.fields[field.id] = configValue;
            return;
        }

        if (field.required || configValue === true) {
            operations.push(function(callback) {
                inquirer.prompt(
                    [
                        {
                            choices: field.allowedValues,
                            message: 'Select the ' + field.name + ':',
                            name: 'fieldName',
                            type: 'list'
                        }
                    ], function(answers) {
                        var fieldValue = instance.findFirstArrayValue_(
                            field.allowedValues, 'name', answers.fieldName);

                        if (field.schema.type === 'array') {
                            fieldValue = [fieldValue];
                        }
                        payload.fields[field.id] = fieldValue;

                        callback();
                    });
            });
        }
    });

    async.series(operations, function() {
        opt_callback && opt_callback(null, payload);
    });
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

Jira.prototype.getFields_ = function(opt_callback) {
    var instance = this;

    instance.api.listFields(function(err, components) {
        opt_callback && opt_callback(err, components);
    });
};

Jira.prototype.getFieldByName_ = function(name, opt_callback, opt_source) {
    var instance = this,
        field,
        fields,
        operations;

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
        operations,
        type,
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
            type = instance.findFirstArrayValue_(types, 'name', name);
            callback();
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, type);
    });
};

Jira.prototype.getIssueTypes_ = function(opt_callback) {
    var instance = this;

    instance.api.listIssueTypes(function(err, types) {
        opt_callback && opt_callback(err, types);
    });
};

Jira.prototype.getIssueUrl_ = function(number) {
    return url.format({
        hostname: jiraConfig.host,
        pathname: '/browse/' + number,
        port: jiraConfig.port,
        protocol: jiraConfig.protocol
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
                    err = 'No issue type found, try --type "Bug".';
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
            instance.getProjectComponentByName_(
                options.project, options.component, function(err, data) {
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

    instance.api.listPriorities(function(err, priorities) {
        opt_callback && opt_callback(err, priorities);
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
        },
        function(callback) {
            instance.addTransitionFieldsArray_(transition);
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

Jira.prototype.login_ = function(opt_callback) {
    var instance = this;

    inquirer.prompt(
        [
            {
                type: 'input',
                message: 'Enter your JIRA user',
                name: 'user'
            },
            {
                type: 'password',
                message: 'Enter your JIRA password',
                name: 'password'
            }
        ], function(answers) {
            answers.password = instance.encryptText_(answers.password);

            jiraConfig.user = answers.user;
            jiraConfig.password = answers.password;

            base.writeGlobalConfig('plugins.jira', answers);

            opt_callback && opt_callback();
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

    instance.api.searchUsers(query, 0, 50, true, false, opt_callback);
};

Jira.prototype.searchUserByGithubUsername_ = function(query, opt_callback) {
    var instance = this,
        githubUser,
        operations,
        users;

    operations = [
        function(callback) {
            instance.searchUser_(query, function(err, data) {
                if (!err && data.length) {
                    users = data;
                }
                callback(err);
            });
        },
        function(callback) {
            // If any user was found on jira do not call github search.
            if (users) {
                callback();
                return;
            }

            var payload = {
                keyword: query
            };

            base.github.search.users(payload, function(err, data) {
                if (!err) {
                    githubUser = data.users[0];
                }
                callback(err);
            });
        },
        function(callback) {
            // If any user or github user was found on jira do not call github search.
            if (users || !githubUser) {
                callback();
                return;
            }

            instance.searchUser_(githubUser.name, function(err, data) {
                if (!err && data.length) {
                    users = data;
                }
                callback(err);
            });
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, users);
    });
};

Jira.prototype.selectUserWithQuestion_ = function(users, callback) {
    var choices = [];

    users.forEach(function(user) {
        choices.push(user.name);
    });

    inquirer.prompt(
        [
            {
                choices: choices,
                message: 'Which user are you looking for?',
                name: 'username',
                type: 'list'
            }
        ], function(answers) {
            callback(answers.username);
        });
};

Jira.prototype.transition = function(number, name, opt_callback) {
    var instance = this,
        options = instance.options,
        issue,
        newIssue,
        operations,
        payload,
        transition,
        transitionConfig = jiraConfig.transition[name];

    options.message = options.message || '';

    operations = [
        function(callback) {
            instance.getTransitionByName_(number, name, function(err, data) {
                if (!err && data) {
                    transition = data;
                }
                else {
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

            instance.expandTransitionFields_(transitionConfig, transition, payload, function(err, data) {
                if (!err) {
                    payload = data;
                }
                callback(err);
            });
        },
        function(callback) {
            payload = instance.compileObjectValuesTemplate_(payload);

            instance.api.transitionIssue(number, payload, function(err, data) {
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
        action,
        choices,
        issue,
        operations,
        response,
        transitions;

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
            instance.getIssue_(options.number, function(err, data) {
                if (!err) {
                    issue = data;
                }
                callback(err);
            });
        },
        function(callback) {
            choices = [
                'Nothing, thanks',
                'Assign to me',
                'Open in browser',
                new inquirer.Separator()
            ];
            transitions.forEach(function(val) {
                choices.push(val.name);
            });

            inquirer.prompt(
                [
                    {
                        choices: choices,
                        message: 'What do you want to do with ' + logger.clc.greenBright(issue.key + ' ' + issue.fields.summary) + '?',
                        name: 'transition',
                        type: 'list'
                    }
                ], function(answers) {
                    switch (answers.transition) {
                        case 'Assign to me':
                            action = Jira.ACTION_ISSUE_ASSIGN;
                            options.assignee = jiraConfig.user;
                            break;
                        case 'Open in browser':
                            action = Jira.ACTION_ISSUE_OPEN_IN_BROWSER;
                            break;
                        case 'Nothing, thanks':
                            if (options.assignee) {
                                action = Jira.ACTION_ISSUE_ASSIGN;
                            }
                            break;
                        default:
                            action = instance.findFirstArrayValue_(
                                transitions, 'name', answers.transition);
                    }

                    callback();
                });
        },
        function(callback) {
            // If no action was selected don't transition the jira issue.
            if (!action) {
                callback();
                return;
            }

            if (action === Jira.ACTION_ISSUE_ASSIGN) {
                logger.logTemplate(
                    '{{prefix}} [info] Assigning issue to {{magentaBright options.assignee}}', {
                        options: options
                    });

                instance.update(options.number, function(err, issue) {
                    response = issue;
                    callback(err);
                });
            }
            else if (action === Jira.ACTION_ISSUE_OPEN_IN_BROWSER) {
                instance.browser(options.number);
                callback();
            }
            else {
                logger.logTemplate('{{prefix}} [info] Updating issue');

                instance.transition(number, action.name, function(err, data) {
                    if (!err) {
                        response = data;
                    }
                    callback(err);
                });
            }
        }
    ];

    async.series(operations, function(err) {
        opt_callback && opt_callback(err, response);
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