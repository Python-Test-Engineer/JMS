# Job Mangement System (JMS)

This is a document of general ideas.

As an expert project manager, business analyst and developer, use these ideas to create _PLAN.md that achieves these objectives and extends these ideas as best suited.

DO NOT CODE in creating the plan - this will be done in _TECH.md which will spec the tech stack - a browser app with HTMX for UI and node to an SQLite DB (initially then Postgres).

Just add enough information in _PLAN.md for that to be used to produce the _TECH.md which will then be used to code the app.

UX for users must be as simple as possible with larger rather than smaller font and buttons and easy steps to carry out actions.

It is a CMS and Job Tracker application

## Company

Acme Windows (site is dummy example.com) is a company that install windows.

It has a number of engineers to do the installation. They can login to app and edit jobs they have been assigned to updating job status etc.

It has a number of managers who can add customers, jobs and assign jobs to one or more engineers.

There are a number of admins that have permission to do everything.

## JMS

JMS enables customers to be added to the database, ability to add users, change permissions of all users as well as add customers who are given a login (email address and default password JMS123).

All users (company workers and customers) can login but have restricted access, permissions and app component visibility.

## Workflows

There will be a number of workflows from adding a customer, creating a job ticket, assigning engineers and wrok date, updating status and enabling custpmers to llok at the status and details of their own jobs but not management/financial analsis. 

PDF version of Job and Invoice can be created for download initially prior to email options.

This is a standard job tracking/management app/managment tool having various dashboards depending on user rights as well as the ability to search for customers, their jobs search by job, by engineeer and also to create a timeline dasborad to see job gegin/end dates.

## Jobs

Each job has:

- job details
- customer details
- assigned engineers
- status
- start and end date planned
- actual start and end dates


## User Permissions

these are 

- ADMIN
- MANAGER
- ENGINEER
- CUSTOMER

## App styling

We use skills to create anthropic style as well as custom user settings so user can change visual appearance of site.

Apart from a few horizontal nav items. the app has a left TOC for various actions, each using a 'pill' for various management/user actions, with items visible depending on user level.

A table of user access level and cpabilities is available so that admin can chnage what each level is required to see the action items.

