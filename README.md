# GH Jira [![Build Status](https://secure.travis-ci.org/node-gh/gh-jira.png?branch=master)](https://travis-ci.org/node-gh/gh-jira) [![NPM version](https://badge.fury.io/js/gh-jira.png)](http://badge.fury.io/js/gh-jira) [![Dependency Status](https://david-dm.org/node-gh/gh-jira.png)](https://david-dm.org/node-gh/gh-jira)

![Inspectocat](http://zno.io/RNPr/inspectocat.png)

NodeGH plugin for integrating [Jira](https://www.atlassian.com/software/jira), an issue management system.

> Maintained by [Eduardo Lundgren](https://github.com/eduardolundgren).

## Install

```
[sudo] npm install -g gh-jira
```

## Usage

```
gh jira
```

> **Alias:** `gh ji`

### 1. Create

Option             | Usage        | Type
---                | ---          | ---
`-N`, `--new`      | **Required** | `Boolean`
`-p`, `--project`  | **Required** | `String`
`-t`, `--title`    | **Required** | `String`
`-A`, `--assignee` | *Optional*   | `String`
`-C`, `--component`| *Optional*   | `String`
`-m`, `--message`  | *Optional*   | `String`
`-P`, `--priority` | *Optional*   | `String`
`-R`, `--reporter` | *Optional*   | `String`
`-t`, `--type`     | *Optional*   | `String`
`-v`, `--version`  | *Optional*   | `String`

#### Examples

* Create a new issue on a certain project.

    ```
gh jira --new --project LPS --title 'Node GH rocks!' --message 'Body with **Markdown** support'
    ```

* Create a new issue specifying the component.

    ```
gh jira --new --project LPS --title 'Node GH rocks!' --component UI
    ```

* Create a new issue and assign it to someone.

    ```
gh jira --new --project LPS --title 'Node GH rocks!' --assignee eduardolundgren
    ```

### 2. Comment

Option           | Usage        | Type
---              | ---          | ---
`-c`, `--comment`| **Required** | `String`
`-n`, `--number` | **Required** | `Number`

Omitting `--number` will guess issue number from the last commit message.

#### Examples

* Comment on an issue.

    ```
gh jira LPS-123 --comment "Merged, **thank you**!"
    ```

### 3. Open in Browser

Option                 | Usage        | Type
---                    | ---          | ---
`-B`, `--browser`      | **Required** | `Boolean`
`-n`, `--number`       | **Required** | `Number`

Omitting `--number` will guess issue number from the last commit message.

#### Examples

* Open Jira issue page in the browser.

    ```
gh jira LPS-123 --browser
    ```

### 4. Transition

Option             | Usage        | Type
---                | ---          | ---
`--transition`     | **Required** | `String`
`-n`, `--number`   | **Required** | `Number`
`-A`, `--assignee` | *Optional*   | `String`
`-m`, `--message`  | *Optional*   | `String`

Omitting `--number` will guess issue number from the last commit message.

Both Jira and GitHub usernames are supported `--assignee` values.

#### Examples

* Start progress on an issue.

    ```
gh jira LPS-123 --transition "Start Progress"
    ```

* Show valid transitions for the issue.

    ```
gh jira LPS-123 --transition
    ```

* Show valid transitions for the issue and assign to an user.

    ```
gh jira LPS-123 --assignee brianchandotcom --transition
    ```

## Testing

Check [Travis](https://travis-ci.org/node-gh/gh-jira) for continous integration results.

* Run [JSHint](http://www.jshint.com/), a tool to detect errors and potential problems.

    ```
npm run-script lint
    ```

* Run [Mocha](http://visionmedia.github.io/mocha/), a unit test framework.

    ```
npm run-script test
    ```

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## History

Check [Release](https://github.com/node-gh/gh-jira/releases) list.

## License

[BSD License](https://github.com/node-gh/gh/blob/master/LICENSE.md)
