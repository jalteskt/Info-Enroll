# Editing page markup

Open the HTML file for the page you want to edit. These files are fragments loaded by the existing application; open the app through public/index.html on your local preview server, not a pages file directly.

- enrollment.html: course catalog, course rows, plan sidebar, mobile plan bar
- schedule.html: weekly schedule
- academic-record.html: academic record
- summary.html: enrollment summary
- login.html: sign-in screen
- professor.html and admin.html: staff views
- shared.html: navigation, branding, layout shell, shared badges and statistics
- dialogs.html: section picker, help and other dialogs
- icons.html: shared SVG icons

Each named <template> is a page or reusable fragment. Edit its tags, labels, classes, and layout here. Keep its id and {{placeholder}} names unless you also update the corresponding renderTemplate call in app.js or staff.js. Search for the template id to find its data bindings.

Placeholders accept text or generated markup. They are substituted once, without evaluating code. Existing user-provided text is escaped in JavaScript before insertion; preserve that escaping when adding inputs. Do not insert untrusted HTML.

JavaScript still owns state, loops, calculations, event handlers, and dynamic data. CSS remains in public/css/styles.css. This conversion requires no build step or new production dependency.
