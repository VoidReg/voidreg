use actix_web::web::ServiceConfig;

pub mod admin;
pub mod auth;
pub mod blogs;
pub mod comments;
pub mod contact;
pub mod graph;
pub mod health;
pub mod mcp;
pub mod media;
pub mod newsletter;
pub mod projects;
pub mod sitemap;
pub mod tags;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/mcp")
            .wrap(actix_web::middleware::DefaultHeaders::new().add(("Cache-Control", "no-store")))
            .configure(mcp::configure),
    )
    .service(projects::list_projects)
    .service(projects::get_project)
    .service(graph::graph)
    .service(tags::tags)
    .service(blogs::list_blogs)
    .service(blogs::get_blog)
    .service(
        actix_web::web::resource("/blogs/{slug}/comments")
            .app_data(actix_web::web::JsonConfig::default().limit(8192))
            .route(actix_web::web::get().to(comments::list_comments))
            .route(actix_web::web::post().to(comments::create_comment)),
    )
    .service(comments::list_replies)
    .service(contact::create_contact)
    .service(newsletter::subscribe)
    .service(auth::providers)
    .service(auth::start)
    .service(auth::callback)
    .service(auth::show_session)
    .service(auth::clear_session)
    .service(
        actix_web::web::scope("/admin")
            .wrap(actix_web::middleware::DefaultHeaders::new().add(("Cache-Control", "no-store")))
            .configure(admin::configure),
    );
}
