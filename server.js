"use strict";

require('dotenv').config();

const PORT          = process.env.PORT || 8080;
const ENV           = process.env.ENV || "development";
const express       = require("express");
const bodyParser    = require("body-parser");
const sass          = require("node-sass-middleware");
const app           = express();
const cookieSession = require("cookie-session");
const bcrypt        = require("bcrypt");

const knexConfig  = require("./knexfile");
const knex        = require("knex")(knexConfig[ENV]);
const morgan      = require('morgan');
const knexLogger  = require('knex-logger');

// Seperated Routes for each Resource
const listRoutes = require("./routes/list");
const taskRoutes = require("./routes/task");
const usersRoutes = require("./routes/users");


// const getCurrentUser = (user_id) => {
//   return knex('users')
//     .where('id', user_id)
//     .first()
//     .then((user) => {
//       return user.handle;
//     })
// }

// Load the logger first so all (static) HTTP requests are logged to STDOUT
// 'dev' = Concise output colored by response status for development use.
//         The :status token will be colored red for server error codes,
// yellow for client error codes, cyan for redirection codes, and uncolored for all other codes.
app.use(morgan('dev'));

// Log knex SQL queries to STDOUT as well
app.use(knexLogger(knex));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/styles", sass({
  src: __dirname + "/styles",
  dest: __dirname + "/public/styles",
  debug: true,
  outputStyle: 'expanded'
}));
app.use(express.static("public"));

app.use(cookieSession({
  name: 'session',
  keys: ["key 1"],
  maxAge: 24 * 60 * 60 * 1000
}));

// Mounts list resource to url
app.use("/api/list", listRoutes(knex));

// Mounts tasks resource to url
app.use("/api/task", taskRoutes(knex));

// Mounts users resource to url
app.use("/api/users", usersRoutes(knex));

// Home page
app.get("/", (req, res) => {
  let user_id = req.session.user_id;
  // getCurrentUser(user_id).then((currentUser) => {
    let dataIntoForm = { user_id: user_id}
    res.render('index', dataIntoForm);
  // })
});

// List
app.get("/list/:id", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  res.render("list_show", user_id);
});

// --> Login & Registration Logic <-- //

// Login
app.get("/login", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  res.render("login", user_id);
});

app.post("/login", (req, res) => {
  let loginCredentials = false
  let email = req.body.email
  let password = req.body.password

  if (!email || !password) {
    loginCredentials = false;
    res.status(401).send('Please enter a valid email/password')
    return
  }

  knex.select().table('users')
  .then((result) => {
    for (let user of result) {
      if (email === user.email) {
        if (bcrypt.compareSync(password, user.password)) {
          loginCredentials = true
          let user_email = email;
          knex('users')
          .returning('id')
          .where('email', user_email)
          .then((user) => {
            req.session.user_id = user[0].id
            res.redirect('/')
          })
        }
      }
    }
    if (!loginCredentials) {
      res.status(403).send('Please enter a valid email/password')
      return;
    }
  })
})

// Registers
app.get("/register", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  res.render("register", user_id);
});

app.post("/register", (req, res) => {
  let invalidFormSubmit = false
  let name = req.body.name
  let email = req.body.email
  let password = req.body.password
  let passConfirmation = req.body.confirm_password
  let handle = req.body.handle

  if (password != passConfirmation) {
    invalidFormSubmit = true
    res.status(401).send('Password does not match the confirm password.')
    return
  }

  if (!handle.match(/^[a-zA-Z0-9]+$/)) {
    invalidFormSubmit = true
    res.status(401).send('Sorry but no special characters such as <>/%#&? are allowed for the username');
    return
  } else {
    handle = "@" + req.body.handle
  }

  if (!email || !password) {
    let invalidFormSubmit = true
    res.status(401).send('Please enter a valid email/password')
    return
  }

  knex.select().table('users')
  .then((result) => {
    for (let user of result) {
      if (email === user.email) {
        let invalidFormSubmit = true
        res.status(403).send('This email is already registered')
        return
      }
    }
  })

  if (!invalidFormSubmit) {
    knex('users')
      .returning('id')
      .insert({
        name: name,
        email: email,
        password: bcrypt.hashSync(password, 10),
        handle: handle
      })
      .then((user) => {
        //res.json(results);
        req.session.user_id = user[0];
        res.redirect("/")
    });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect('/');
});

// User update email and password
// Helper function for email update
function emailUpdater(user_id, newEmail) {
  return knex('users')
  .returning('user')
  .where({ id: user_id })
  .first()
  .then((user) => {
      return knex('users')
      .where({ id: user_id })
      .update({ email: newEmail })
  });
};

// Helper function for password update
function passwordUpdater(user_id, newPassword) {
  return knex('users')
  .returning('user')
  .where({ id: user_id })
  .first()
  .then((user) => {
      return knex('users')
      .where({ id: user_id })
      .update({ password: bcrypt.hashSync(newPassword, 10) })
  });
};

// Handles post requests for updates
app.post("/updateinfo", (req, res) => {
  let user_id = req.session.user_id;
  let newEmail = req.body.email;
  let newPassword = req.body.password;

  let emailPromise = Promise.resolve();
  let passwordPromise = Promise.resolve();
  if (newEmail) {
    emailPromise = emailUpdater(user_id, newEmail);
  }

  if (newPassword) {
    passwordPromise = passwordUpdater(user_id, newPassword)
  }

  Promise.all([emailPromise, passwordPromise])
  .then(() => {
    res.redirect('/users');
  });

});

// --><-- //

// --> Users Requests <-- //

// User Profile Page
app.get("/users", (req, res) => {
  let user_id = { user_id: req.session.user_id };

  if (!user_id['user_id']) {
    res.redirect("/");
  } else {
    res.render("users", user_id);
  }
});

// Username Display on User Page
// (Sends all user data to user page)
app.get("/users/username", (req, res) => {

  knex('users')
  .select('*')
  .where('id', req.session.user_id)
  .then((results) => {
    res.json(results);
  })

})

// Display Users Lists on User Page
app.get("/users/myList", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  if (!user_id['user_id']) {
    res.redirect("/");
  } else {
    knex('list')
    .select('*')
    .where('fk_users_id', req.session.user_id)
    .then((results) => {
      res.json(results);
    })
  }
})

// Delete List
app.post("/users/:id/delete", (req, res) => {
  let list = req.params.id
  knex('list')
    .where('list_id', list)
    .del()
    .then(() => {
      res.redirect('/users')
    })
})

// Update List Page
app.get("/list/:id/update", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  let list = req.params.id

  res.render("update", user_id);
})


// User Create List Page
app.get("/newList", (req, res) => {
  let user_id = { user_id: req.session.user_id };
  if (!user_id['user_id']) {
    res.redirect("/");
  } else {
    res.render("newList", user_id);
  }
})

// User Generates a list and redirects user to a new page where they have to input task
app.post("/newList", (req, res) => {

  let user = req.session.user_id
  let title = req.body.title
  let category = req.body.category
  let time = req.body.time

  knex('list')
    .returning('list_id')
    .insert({
      fk_users_id: user,
      title: title,
      category: category,
      time: time
    })
    .then((list_id) => {

      // $('<p>').text('Hey it worked!').append($('body'));
      // console.log(id);
      // console.log(list_id);
      res.redirect("/newList/" + list_id);
    })
});

app.get("/newList/:list_id" , (req,res) => {
  let user_id = { user_id: req.session.user_id };
  if (!user_id['user_id']) {
    res.redirect("/");
  } else {
    res.render("add_task", user_id);
  }
});

// --><-- //

app.listen(PORT, () => {
  console.log("Example app listening on port " + PORT);
});
